import type { Rol } from '@cambios-jc/shared';
import QRCode from 'qrcode';

import type { Config } from '../../lib/config.js';
import {
  hashContrasena,
  verificarContraHashFalso,
  verificarContrasena,
} from '../../lib/contrasenas.js';
import { cifrar, descifrar, leerClave } from '../../lib/cifrado.js';
import { ErrorApp, errores } from '../../lib/errores.js';
import type { Prisma, PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria, type DatosAuditoria } from '../../lib/registrar-auditoria.js';
import { generarToken, hashToken } from '../../lib/tokens.js';
import { generarSecretoTotp, urlOtpauth, verificarCodigo } from '../../lib/totp.js';
import type { SesionActual, UsuarioAutenticado } from '../../plugins/permisos.js';

export type PasoSiguiente = 'cambiar_contrasena' | 'configurar_2fa' | 'verificar_2fa';

/** Dónde y con qué se hizo la petición (para la bitácora y la sesión). */
export interface ContextoPeticion {
  ip: string | null;
  agenteUsuario: string | null;
}

/** Token nuevo que el llamador debe poner en la cookie. */
export interface SesionEmitida {
  token: string;
  expiraEn: Date;
}

export interface ConfigAuth {
  inactividadMs: number;
  maximaMs: number;
  parcialMs: number;
  intentosMaximos: number;
  bloqueoMs: number;
  claveCifrado: Buffer;
}

export function configAuthDe(config: Config): ConfigAuth {
  return {
    inactividadMs: config.SESION_INACTIVIDAD_MINUTOS * 60_000,
    maximaMs: config.SESION_MAXIMA_HORAS * 3_600_000,
    parcialMs: config.SESION_PARCIAL_MINUTOS * 60_000,
    intentosMaximos: config.LOGIN_INTENTOS_MAXIMOS,
    bloqueoMs: config.LOGIN_BLOQUEO_MINUTOS * 60_000,
    claveCifrado: leerClave(config.CLAVE_CIFRADO_2FA),
  };
}

export interface Configuracion2fa {
  /** Secreto en base32, para escribirlo a mano si no se puede escanear el QR. */
  secreto: string;
  otpauthUrl: string;
  /** Imagen PNG del QR como `data:image/png;base64,...`. */
  qr: string;
}

export interface UsuarioConSesion {
  usuario: { id: string; nombre: string; login: string; rol: Rol };
  sesion: SesionEmitida;
}

/** Cada cuánto se actualiza `ultimaActividad`: evita una escritura en la base por cada petición. */
const REFRESCO_ACTIVIDAD_MS = 60_000;

const LARGO_MAXIMO_LOGIN_EN_BITACORA = 60;

type ClienteBd = PrismaClient | Prisma.TransactionClient;

export type ServicioAuth = ReturnType<typeof crearServicioAuth>;

export function crearServicioAuth({ prisma, config }: { prisma: PrismaClient; config: Config }) {
  const cfg = configAuthDe(config);

  const auditar = (
    cliente: ClienteBd,
    contexto: ContextoPeticion,
    datos: Omit<DatosAuditoria, 'ip' | 'agenteUsuario'>,
  ) =>
    registrarAuditoria(cliente, {
      ...datos,
      ip: contexto.ip,
      agenteUsuario: contexto.agenteUsuario,
    });

  async function crearSesion(
    cliente: ClienteBd,
    usuarioId: string,
    completa: boolean,
    contexto: ContextoPeticion,
  ): Promise<SesionEmitida> {
    const ahora = Date.now();
    const token = generarToken();
    const expiraEn = new Date(ahora + (completa ? cfg.maximaMs : cfg.parcialMs));
    await cliente.sesion.create({
      data: {
        usuarioId,
        tokenHash: hashToken(token),
        completa,
        expiraEn,
        ultimaActividad: new Date(ahora),
        ip: contexto.ip,
        agenteUsuario: contexto.agenteUsuario,
      },
    });
    return { token, expiraEn };
  }

  function pasoSiguiente(usuario: {
    debeCambiarContrasena: boolean;
    tiene2fa: boolean;
  }): PasoSiguiente {
    if (usuario.debeCambiarContrasena) return 'cambiar_contrasena';
    return usuario.tiene2fa ? 'verificar_2fa' : 'configurar_2fa';
  }

  /**
   * Suma un fallo (contraseña o código). Al llegar al máximo bloquea la cuenta y cierra todas sus
   * sesiones. Devuelve hasta cuándo quedó bloqueada, o `null` si aún no.
   */
  async function registrarFallo(
    usuarioId: string,
    accion: string,
    contexto: ContextoPeticion,
  ): Promise<Date | null> {
    return prisma.$transaction(async (tx) => {
      const { intentosFallidos } = await tx.usuario.update({
        where: { id: usuarioId },
        data: { intentosFallidos: { increment: 1 } },
        select: { intentosFallidos: true },
      });

      let bloqueadoHasta: Date | null = null;
      if (intentosFallidos >= cfg.intentosMaximos) {
        bloqueadoHasta = new Date(Date.now() + cfg.bloqueoMs);
        await tx.usuario.update({
          where: { id: usuarioId },
          data: { intentosFallidos: 0, bloqueadoHasta },
        });
        await tx.sesion.updateMany({
          where: { usuarioId, revocada: false },
          data: { revocada: true },
        });
      }

      await auditar(tx, contexto, {
        usuarioId,
        accion,
        entidad: 'usuario',
        entidadId: usuarioId,
        despues: { bloqueada: bloqueadoHasta !== null },
      });
      if (bloqueadoHasta) {
        await auditar(tx, contexto, {
          usuarioId,
          accion: 'auth.cuenta_bloqueada',
          entidad: 'usuario',
          entidadId: usuarioId,
          despues: { bloqueadoHasta },
        });
      }
      return bloqueadoHasta;
    });
  }

  function errorPorFallo(bloqueadoHasta: Date | null, errorNormal: ErrorApp): ErrorApp {
    if (!bloqueadoHasta) return errorNormal;
    return errores.cuentaBloqueada(minutosHasta(bloqueadoHasta));
  }

  function minutosHasta(fecha: Date): number {
    return Math.max(1, Math.ceil((fecha.getTime() - Date.now()) / 60_000));
  }

  /** Renueva el plazo de la sesión parcial: cada paso correcto da otros `parcialMs` para el siguiente. */
  async function renovarSesionParcial(sesionId: string): Promise<void> {
    await prisma.sesion.update({
      where: { id: sesionId },
      data: { expiraEn: new Date(Date.now() + cfg.parcialMs), ultimaActividad: new Date() },
    });
  }

  /** Cierra la sesión parcial y abre la completa. Deja el acceso registrado. */
  async function completarAcceso(
    usuarioId: string,
    sesionParcialId: string,
    paso: number,
    activar2fa: boolean,
    contexto: ContextoPeticion,
  ): Promise<UsuarioConSesion> {
    return prisma.$transaction(async (tx) => {
      // Condición en la actualización: si dos peticiones llegan a la vez con el mismo código,
      // solo una encuentra `ultimoPaso2fa` menor que el paso y la otra queda rechazada.
      const cambio = await tx.usuario.updateMany({
        where: {
          id: usuarioId,
          OR: [{ ultimoPaso2fa: null }, { ultimoPaso2fa: { lt: paso } }],
        },
        data: {
          ultimoPaso2fa: paso,
          intentosFallidos: 0,
          bloqueadoHasta: null,
          ultimoAcceso: new Date(),
          ...(activar2fa ? { tiene2fa: true } : {}),
        },
      });
      if (cambio.count !== 1) throw errores.codigoInvalido();

      await tx.sesion.update({ where: { id: sesionParcialId }, data: { revocada: true } });
      const sesion = await crearSesion(tx, usuarioId, true, contexto);
      const usuario = await tx.usuario.findUniqueOrThrow({
        where: { id: usuarioId },
        select: { id: true, nombre: true, login: true, rol: true },
      });

      if (activar2fa) {
        await auditar(tx, contexto, {
          usuarioId,
          accion: 'auth.2fa_activar',
          entidad: 'usuario',
          entidadId: usuarioId,
        });
      }
      await auditar(tx, contexto, {
        usuarioId,
        accion: 'auth.login',
        entidad: 'usuario',
        entidadId: usuarioId,
      });
      return { usuario, sesion };
    });
  }

  async function usuarioDeSesion(usuarioId: string) {
    return prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
  }

  return {
    /** Paso 1: usuario y contraseña. Abre una sesión parcial. */
    async iniciarSesion(
      login: string,
      contrasena: string,
      contexto: ContextoPeticion,
    ): Promise<{ sesion: SesionEmitida; siguientePaso: PasoSiguiente; nombre: string }> {
      const usuario = await prisma.usuario.findUnique({ where: { login } });

      if (!usuario?.activo) {
        await verificarContraHashFalso(contrasena);
        await auditar(prisma, contexto, {
          accion: 'auth.login_fallido',
          entidad: 'usuario',
          despues: {
            motivo: 'usuario_inexistente_o_inactivo',
            login: login.slice(0, LARGO_MAXIMO_LOGIN_EN_BITACORA),
          },
        });
        throw errores.credencialesInvalidas();
      }

      if (usuario.bloqueadoHasta && usuario.bloqueadoHasta.getTime() > Date.now()) {
        await auditar(prisma, contexto, {
          usuarioId: usuario.id,
          accion: 'auth.login_bloqueado',
          entidad: 'usuario',
          entidadId: usuario.id,
        });
        throw errores.cuentaBloqueada(minutosHasta(usuario.bloqueadoHasta));
      }

      if (!(await verificarContrasena(usuario.hashContrasena, contrasena))) {
        const bloqueadoHasta = await registrarFallo(usuario.id, 'auth.login_fallido', contexto);
        throw errorPorFallo(bloqueadoHasta, errores.credencialesInvalidas());
      }

      const sesion = await prisma.$transaction(async (tx) => {
        const nueva = await crearSesion(tx, usuario.id, false, contexto);
        await auditar(tx, contexto, {
          usuarioId: usuario.id,
          accion: 'auth.contrasena_correcta',
          entidad: 'usuario',
          entidadId: usuario.id,
          despues: { siguientePaso: pasoSiguiente(usuario) },
        });
        return nueva;
      });
      return { sesion, siguientePaso: pasoSiguiente(usuario), nombre: usuario.nombre };
    },

    /** Resuelve el token de la cookie. `null` si no hay sesión válida (inexistente, revocada, vencida). */
    async resolverSesion(token: string | undefined): Promise<SesionActual | null> {
      if (!token) return null;
      const sesion = await prisma.sesion.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { usuario: true },
      });
      if (!sesion || sesion.revocada || !sesion.usuario.activo) return null;

      const ahora = Date.now();
      if (sesion.expiraEn.getTime() <= ahora) return null;
      const inactividad = ahora - sesion.ultimaActividad.getTime();
      if (sesion.completa && inactividad > cfg.inactividadMs) return null;
      if (sesion.completa && inactividad > REFRESCO_ACTIVIDAD_MS) {
        await prisma.sesion.update({
          where: { id: sesion.id },
          data: { ultimaActividad: new Date() },
        });
      }

      const usuario: UsuarioAutenticado = {
        id: sesion.usuario.id,
        login: sesion.usuario.login,
        nombre: sesion.usuario.nombre,
        rol: sesion.usuario.rol,
        sesionId: sesion.id,
      };
      return { usuario, completa: sesion.completa };
    },

    /** Cambio obligatorio de la contraseña temporal (solo con sesión parcial). */
    async cambiarContrasena(
      actual: UsuarioAutenticado,
      contrasenaActual: string,
      contrasenaNueva: string,
      contexto: ContextoPeticion,
    ): Promise<{ siguientePaso: PasoSiguiente }> {
      const usuario = await usuarioDeSesion(actual.id);
      if (!usuario.debeCambiarContrasena) {
        throw errores.estadoInvalido('Tu contraseña no está pendiente de cambio.');
      }

      if (!(await verificarContrasena(usuario.hashContrasena, contrasenaActual))) {
        const bloqueadoHasta = await registrarFallo(
          usuario.id,
          'auth.cambio_contrasena_fallido',
          contexto,
        );
        throw errorPorFallo(bloqueadoHasta, errores.credencialesInvalidas());
      }
      if (contrasenaNueva === contrasenaActual) {
        throw new ErrorApp(400, 'VALIDACION_FALLIDA', 'Los datos enviados no son válidos.', [
          {
            campo: 'contrasenaNueva',
            mensaje: 'La contraseña nueva debe ser distinta de la actual.',
          },
        ]);
      }

      const hash = await hashContrasena(contrasenaNueva);
      await prisma.$transaction(async (tx) => {
        await tx.usuario.update({
          where: { id: usuario.id },
          data: { hashContrasena: hash, debeCambiarContrasena: false },
        });
        await auditar(tx, contexto, {
          usuarioId: usuario.id,
          accion: 'usuario.cambiar_contrasena',
          entidad: 'usuario',
          entidadId: usuario.id,
        });
      });
      await renovarSesionParcial(actual.sesionId);
      return {
        siguientePaso: pasoSiguiente({ debeCambiarContrasena: false, tiene2fa: usuario.tiene2fa }),
      };
    },

    /** Genera un secreto TOTP nuevo (cifrado en la base) y su QR. Se puede repetir hasta activarlo. */
    async configurar2fa(
      actual: UsuarioAutenticado,
      contexto: ContextoPeticion,
    ): Promise<Configuracion2fa> {
      const usuario = await usuarioDeSesion(actual.id);
      if (usuario.debeCambiarContrasena) {
        throw errores.estadoInvalido('Primero debes cambiar tu contraseña temporal.');
      }
      if (usuario.tiene2fa) {
        throw errores.estadoInvalido('Tu verificación en dos pasos ya está activada.');
      }

      const secreto = generarSecretoTotp();
      const otpauthUrl = urlOtpauth(secreto, usuario.login);
      const qr = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 });

      await prisma.$transaction(async (tx) => {
        await tx.usuario.update({
          where: { id: usuario.id },
          data: { secreto2fa: cifrar(secreto, cfg.claveCifrado), ultimoPaso2fa: null },
        });
        await auditar(tx, contexto, {
          usuarioId: usuario.id,
          accion: 'auth.2fa_configurar',
          entidad: 'usuario',
          entidadId: usuario.id,
        });
      });
      await renovarSesionParcial(actual.sesionId);
      return { secreto, otpauthUrl, qr };
    },

    /** Confirma el 2FA con el primer código de la aplicación y deja la sesión completa. */
    async activar2fa(
      actual: UsuarioAutenticado,
      codigo: string,
      contexto: ContextoPeticion,
    ): Promise<UsuarioConSesion> {
      const usuario = await usuarioDeSesion(actual.id);
      if (usuario.debeCambiarContrasena) {
        throw errores.estadoInvalido('Primero debes cambiar tu contraseña temporal.');
      }
      if (usuario.tiene2fa) {
        throw errores.estadoInvalido('Tu verificación en dos pasos ya está activada.');
      }
      if (!usuario.secreto2fa) {
        throw errores.estadoInvalido('Primero debes generar el código QR.');
      }

      const secreto = descifrar(usuario.secreto2fa, cfg.claveCifrado);
      const resultado = await verificarCodigo(secreto, codigo, usuario.ultimoPaso2fa);
      if (!resultado.valido) {
        const bloqueadoHasta = await registrarFallo(usuario.id, 'auth.2fa_fallido', contexto);
        throw errorPorFallo(bloqueadoHasta, errores.codigoInvalido());
      }
      return completarAcceso(usuario.id, actual.sesionId, resultado.paso, true, contexto);
    },

    /** Paso 2 del acceso habitual: código de la aplicación autenticadora. */
    async verificar2fa(
      actual: UsuarioAutenticado,
      codigo: string,
      contexto: ContextoPeticion,
    ): Promise<UsuarioConSesion> {
      const usuario = await usuarioDeSesion(actual.id);
      if (usuario.debeCambiarContrasena) {
        throw errores.estadoInvalido('Primero debes cambiar tu contraseña temporal.');
      }
      if (!usuario.tiene2fa || !usuario.secreto2fa) {
        throw errores.estadoInvalido('Aún no has configurado la verificación en dos pasos.');
      }

      const secreto = descifrar(usuario.secreto2fa, cfg.claveCifrado);
      const resultado = await verificarCodigo(secreto, codigo, usuario.ultimoPaso2fa);
      if (!resultado.valido) {
        const bloqueadoHasta = await registrarFallo(usuario.id, 'auth.2fa_fallido', contexto);
        throw errorPorFallo(bloqueadoHasta, errores.codigoInvalido());
      }
      return completarAcceso(usuario.id, actual.sesionId, resultado.paso, false, contexto);
    },

    /** Cierra la sesión de la cookie. No falla si ya no existía. */
    async cerrarSesion(token: string | undefined, contexto: ContextoPeticion): Promise<void> {
      if (!token) return;
      const sesion = await prisma.sesion.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!sesion || sesion.revocada) return;
      await prisma.$transaction(async (tx) => {
        await tx.sesion.update({ where: { id: sesion.id }, data: { revocada: true } });
        await auditar(tx, contexto, {
          usuarioId: sesion.usuarioId,
          accion: 'auth.logout',
          entidad: 'usuario',
          entidadId: sesion.usuarioId,
        });
      });
    },

    /** Para el administrador (la ruta se expone en la tarea 0.8): cierra todas las sesiones de un usuario. */
    async cerrarSesionesDeUsuario(
      usuarioId: string,
      actorId: string,
      contexto: ContextoPeticion,
    ): Promise<number> {
      return prisma.$transaction(async (tx) => {
        const { count } = await tx.sesion.updateMany({
          where: { usuarioId, revocada: false },
          data: { revocada: true },
        });
        await auditar(tx, contexto, {
          usuarioId: actorId,
          accion: 'usuario.cerrar_sesiones',
          entidad: 'usuario',
          entidadId: usuarioId,
          despues: { sesionesCerradas: count },
        });
        return count;
      });
    },

    /**
     * Para el administrador (ruta en la tarea 0.8): borra el 2FA del usuario, que tendrá que
     * configurarlo de nuevo, y cierra sus sesiones.
     */
    async reiniciar2fa(
      usuarioId: string,
      actorId: string,
      contexto: ContextoPeticion,
    ): Promise<void> {
      await prisma.$transaction(async (tx) => {
        await tx.usuario.update({
          where: { id: usuarioId },
          data: { tiene2fa: false, secreto2fa: null, ultimoPaso2fa: null },
        });
        await tx.sesion.updateMany({
          where: { usuarioId, revocada: false },
          data: { revocada: true },
        });
        await auditar(tx, contexto, {
          usuarioId: actorId,
          accion: 'usuario.reiniciar_2fa',
          entidad: 'usuario',
          entidadId: usuarioId,
        });
      });
    },
  };
}
