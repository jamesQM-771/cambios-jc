import { generarContrasenaTemporal, hashContrasena } from './contrasenas.js';
import type { PrismaClient } from './prisma.js';
import { registrarAuditoria } from './registrar-auditoria.js';

export const ORIGEN_EMERGENCIA = 'script de emergencia';

export class ErrorRestablecerAdmin extends Error {}

export interface ResultadoRestablecer {
  login: string;
  contrasenaTemporal: string;
}

/**
 * Recupera el acceso de un administrador cuando ningún otro puede hacerlo (D43): contraseña temporal
 * nueva, 2FA reiniciado, usuario reactivado, bloqueo levantado y sesiones cerradas. Solo sirve para
 * administradores. Es para correr en el servidor, no está expuesto en la API. Queda en la bitácora.
 *
 * `confirmacion` debe repetir el login: evita restablecer a la persona equivocada por un descuido.
 */
export async function restablecerAdministrador(
  prisma: PrismaClient,
  datos: { login: string; confirmacion: string },
): Promise<ResultadoRestablecer> {
  const login = datos.login.trim().toLowerCase();
  if (!login) throw new ErrorRestablecerAdmin('Indica el login del administrador.');
  if (datos.confirmacion.trim().toLowerCase() !== login) {
    throw new ErrorRestablecerAdmin('La confirmación no coincide con el login. No se cambió nada.');
  }

  const contrasenaTemporal = generarContrasenaTemporal();
  const hash = await hashContrasena(contrasenaTemporal);

  await prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.findUnique({ where: { login } });
    if (!usuario) throw new ErrorRestablecerAdmin(`No existe un usuario con el login "${login}".`);
    if (usuario.rol !== 'administrador') {
      throw new ErrorRestablecerAdmin(
        `"${login}" no es administrador. Este script solo restablece administradores.`,
      );
    }
    await tx.usuario.update({
      where: { id: usuario.id },
      data: {
        hashContrasena: hash,
        debeCambiarContrasena: true,
        activo: true,
        tiene2fa: false,
        secreto2fa: null,
        ultimoPaso2fa: null,
        intentosFallidos: 0,
        bloqueadoHasta: null,
      },
    });
    await tx.sesion.updateMany({
      where: { usuarioId: usuario.id, revocada: false },
      data: { revocada: true },
    });
    await registrarAuditoria(tx, {
      usuarioId: null,
      accion: 'usuario.restablecer_acceso_emergencia',
      entidad: 'usuario',
      entidadId: usuario.id,
      antes: { activo: usuario.activo, tiene2fa: usuario.tiene2fa },
      despues: { activo: true, tiene2fa: false, debeCambiarContrasena: true },
      agenteUsuario: ORIGEN_EMERGENCIA,
    });
  });

  return { login, contrasenaTemporal };
}
