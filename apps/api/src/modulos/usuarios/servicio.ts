import type { Rol } from '@cambios-jc/shared';

import { Prisma } from '../../generated/prisma/client.js';
import { generarContrasenaTemporal, hashContrasena } from '../../lib/contrasenas.js';
import { ErrorApp, errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria, type DatosAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion, ServicioAuth } from '../auth/servicio.js';

import type { UsuarioPublico } from './esquemas.js';

/** Qué usuarios y campos salen hacia afuera: nunca el hash, el secreto 2FA ni el contador de intentos. */
const SELECCION_PUBLICA = {
  id: true,
  nombre: true,
  login: true,
  rol: true,
  sucursalId: true,
  activo: true,
  tiene2fa: true,
  debeCambiarContrasena: true,
  bloqueadoHasta: true,
  ultimoAcceso: true,
  creadoEn: true,
  sucursal: { select: { nombre: true } },
} satisfies Prisma.UsuarioSelect;

type FilaPublica = Prisma.UsuarioGetPayload<{ select: typeof SELECCION_PUBLICA }>;

function aPublico({ sucursal, ...usuario }: FilaPublica): UsuarioPublico {
  return { ...usuario, sucursalNombre: sucursal?.nombre ?? null };
}

export interface FiltroUsuarios {
  rol?: Rol;
  activo?: boolean;
  busqueda?: string;
  pagina: number;
  porPagina: number;
}

export interface DatosNuevoUsuario {
  nombre: string;
  login: string;
  rol: Rol;
  sucursalId?: string | null | undefined;
}

export interface CambiosUsuario {
  nombre?: string | undefined;
  rol?: Rol | undefined;
  sucursalId?: string | null | undefined;
}

export interface Actor {
  id: string;
}

type Tx = Prisma.TransactionClient;

export type ServicioUsuarios = ReturnType<typeof crearServicioUsuarios>;

export function crearServicioUsuarios({
  prisma,
  auth,
}: {
  prisma: PrismaClient;
  auth: ServicioAuth;
}) {
  const auditar = (
    tx: Tx,
    actor: Actor,
    contexto: ContextoPeticion,
    datos: Omit<DatosAuditoria, 'usuarioId' | 'ip' | 'agenteUsuario' | 'entidad'>,
  ) =>
    registrarAuditoria(tx, {
      ...datos,
      usuarioId: actor.id,
      entidad: 'usuario',
      ip: contexto.ip,
      agenteUsuario: contexto.agenteUsuario,
    });

  /**
   * Bloquea las filas de los administradores activos hasta el fin de la transacción y devuelve cuántos
   * son. Dos operaciones simultáneas que podrían dejar el sistema sin administradores (por ejemplo,
   * dos administradores desactivándose entre sí) quedan en fila: la segunda ve el resultado de la primera.
   */
  async function contarAdministradoresActivos(tx: Tx): Promise<number> {
    const filas = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM usuario WHERE rol = 'administrador' AND activo = true ORDER BY id FOR UPDATE`;
    return filas.length;
  }

  async function exigirSucursalActiva(tx: Tx, sucursalId: string): Promise<void> {
    const sucursal = await tx.sucursal.findFirst({ where: { id: sucursalId, activa: true } });
    if (!sucursal) {
      throw new ErrorApp(400, 'VALIDACION_FALLIDA', 'Los datos enviados no son válidos.', [
        { campo: 'sucursalId', mensaje: 'La sucursal no existe o está inactiva.' },
      ]);
    }
  }

  async function cargar(tx: Tx | PrismaClient, id: string) {
    const usuario = await tx.usuario.findUnique({ where: { id }, select: SELECCION_PUBLICA });
    if (!usuario) throw errores.noEncontrado('El usuario no existe.');
    return usuario;
  }

  const esUnicoAdministrador = (usuario: FilaPublica, administradoresActivos: number) =>
    usuario.rol === 'administrador' && usuario.activo && administradoresActivos <= 1;

  return {
    async listar(filtro: FiltroUsuarios) {
      const busqueda = filtro.busqueda?.trim();
      const donde: Prisma.UsuarioWhereInput = {
        ...(filtro.rol ? { rol: filtro.rol } : {}),
        ...(filtro.activo === undefined ? {} : { activo: filtro.activo }),
        ...(busqueda
          ? {
              OR: [
                { nombre: { contains: busqueda, mode: 'insensitive' } },
                { login: { contains: busqueda, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [filas, total] = await Promise.all([
        prisma.usuario.findMany({
          where: donde,
          select: SELECCION_PUBLICA,
          orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
          skip: (filtro.pagina - 1) * filtro.porPagina,
          take: filtro.porPagina,
        }),
        prisma.usuario.count({ where: donde }),
      ]);
      return {
        usuarios: filas.map(aPublico),
        total,
        pagina: filtro.pagina,
        porPagina: filtro.porPagina,
      };
    },

    async obtener(id: string): Promise<UsuarioPublico> {
      return aPublico(await cargar(prisma, id));
    },

    /** Crea un usuario con una contraseña temporal aleatoria, que se devuelve una sola vez. */
    async crear(datos: DatosNuevoUsuario, actor: Actor, contexto: ContextoPeticion) {
      const contrasenaTemporal = generarContrasenaTemporal();
      const hash = await hashContrasena(contrasenaTemporal);

      try {
        const usuario = await prisma.$transaction(async (tx) => {
          if (datos.sucursalId) await exigirSucursalActiva(tx, datos.sucursalId);
          const creado = await tx.usuario.create({
            data: {
              nombre: datos.nombre,
              login: datos.login,
              rol: datos.rol,
              sucursalId: datos.sucursalId ?? null,
              hashContrasena: hash,
              debeCambiarContrasena: true,
            },
            select: SELECCION_PUBLICA,
          });
          await auditar(tx, actor, contexto, {
            accion: 'usuario.crear',
            entidadId: creado.id,
            despues: {
              login: creado.login,
              nombre: creado.nombre,
              rol: creado.rol,
              sucursalId: creado.sucursalId,
            },
          });
          return creado;
        });
        return { usuario: aPublico(usuario), contrasenaTemporal };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw errores.loginEnUso();
        }
        throw error;
      }
    },

    async editar(id: string, cambios: CambiosUsuario, actor: Actor, contexto: ContextoPeticion) {
      const usuario = await prisma.$transaction(async (tx) => {
        const administradores = await contarAdministradoresActivos(tx);
        const actual = await cargar(tx, id);

        if (
          cambios.rol &&
          cambios.rol !== 'administrador' &&
          esUnicoAdministrador(actual, administradores)
        ) {
          throw errores.ultimoAdministrador();
        }
        if (cambios.sucursalId) await exigirSucursalActiva(tx, cambios.sucursalId);

        const datos: Prisma.UsuarioUncheckedUpdateInput = {};
        const antes: Record<string, unknown> = {};
        const despues: Record<string, unknown> = {};
        if (cambios.nombre !== undefined && cambios.nombre !== actual.nombre) {
          datos.nombre = cambios.nombre;
          antes.nombre = actual.nombre;
          despues.nombre = cambios.nombre;
        }
        if (cambios.rol !== undefined && cambios.rol !== actual.rol) {
          datos.rol = cambios.rol;
          antes.rol = actual.rol;
          despues.rol = cambios.rol;
        }
        if (cambios.sucursalId !== undefined && cambios.sucursalId !== actual.sucursalId) {
          datos.sucursalId = cambios.sucursalId;
          antes.sucursalId = actual.sucursalId;
          despues.sucursalId = cambios.sucursalId;
        }
        if (Object.keys(datos).length === 0) return actual;

        const editado = await tx.usuario.update({
          where: { id },
          data: datos,
          select: SELECCION_PUBLICA,
        });
        await auditar(tx, actor, contexto, {
          accion: 'usuario.editar',
          entidadId: id,
          antes,
          despues,
        });
        return editado;
      });
      return aPublico(usuario);
    },

    /** Desactiva (nunca borra) y cierra todas sus sesiones. */
    async desactivar(id: string, actor: Actor, contexto: ContextoPeticion) {
      const usuario = await prisma.$transaction(async (tx) => {
        const administradores = await contarAdministradoresActivos(tx);
        const actual = await cargar(tx, id);

        if (id === actor.id) throw errores.noPuedesDesactivarte();
        if (!actual.activo) return actual;
        if (esUnicoAdministrador(actual, administradores)) throw errores.ultimoAdministrador();

        const desactivado = await tx.usuario.update({
          where: { id },
          data: { activo: false },
          select: SELECCION_PUBLICA,
        });
        const { count } = await tx.sesion.updateMany({
          where: { usuarioId: id, revocada: false },
          data: { revocada: true },
        });
        await auditar(tx, actor, contexto, {
          accion: 'usuario.desactivar',
          entidadId: id,
          antes: { activo: true },
          despues: { activo: false, sesionesCerradas: count },
        });
        return desactivado;
      });
      return aPublico(usuario);
    },

    async reactivar(id: string, actor: Actor, contexto: ContextoPeticion) {
      const usuario = await prisma.$transaction(async (tx) => {
        const actual = await cargar(tx, id);
        if (actual.activo) return actual;
        const reactivado = await tx.usuario.update({
          where: { id },
          data: { activo: true },
          select: SELECCION_PUBLICA,
        });
        await auditar(tx, actor, contexto, {
          accion: 'usuario.reactivar',
          entidadId: id,
          antes: { activo: false },
          despues: { activo: true },
        });
        return reactivado;
      });
      return aPublico(usuario);
    },

    /**
     * Nueva contraseña temporal: la anterior deja de servir, el usuario debe cambiarla al entrar,
     * se cierran sus sesiones y se levanta el bloqueo. El 2FA se conserva.
     */
    async restablecerContrasena(id: string, actor: Actor, contexto: ContextoPeticion) {
      const contrasenaTemporal = generarContrasenaTemporal();
      const hash = await hashContrasena(contrasenaTemporal);

      const usuario = await prisma.$transaction(async (tx) => {
        await cargar(tx, id);
        const actualizado = await tx.usuario.update({
          where: { id },
          data: {
            hashContrasena: hash,
            debeCambiarContrasena: true,
            intentosFallidos: 0,
            bloqueadoHasta: null,
          },
          select: SELECCION_PUBLICA,
        });
        await tx.sesion.updateMany({
          where: { usuarioId: id, revocada: false },
          data: { revocada: true },
        });
        await auditar(tx, actor, contexto, {
          accion: 'usuario.restablecer_contrasena',
          entidadId: id,
        });
        return actualizado;
      });
      return { usuario: aPublico(usuario), contrasenaTemporal };
    },

    async reiniciar2fa(id: string, actor: Actor, contexto: ContextoPeticion) {
      await cargar(prisma, id);
      await auth.reiniciar2fa(id, actor.id, contexto);
    },

    async cerrarSesiones(id: string, actor: Actor, contexto: ContextoPeticion): Promise<number> {
      await cargar(prisma, id);
      return auth.cerrarSesionesDeUsuario(id, actor.id, contexto);
    },

    async listarSucursalesActivas() {
      return prisma.sucursal.findMany({
        where: { activa: true },
        select: { id: true, nombre: true, ciudad: true },
        orderBy: { nombre: 'asc' },
      });
    },
  };
}
