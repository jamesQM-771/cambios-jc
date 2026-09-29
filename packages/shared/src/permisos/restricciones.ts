import type { Permiso } from './permisos.js';

/**
 * Permisos que solo puede tener el administrador, sin importar cómo se configuren los demás
 * roles cuando los permisos pasen a ser configurables (fase 13). Hoy: reabrir un cierre.
 */
export const PERMISOS_SOLO_ADMINISTRADOR: readonly Permiso[] = ['caja.reabrir'];

/**
 * Pares de permisos que ningún rol puede tener a la vez: "quien recibe el dinero no es quien
 * lo paga" (PROYECTO.md §6). El vendedor registra la remesa; el digitador la paga.
 */
export const PERMISOS_INCOMPATIBLES: readonly (readonly [Permiso, Permiso])[] = [
  ['remesa.registrar', 'remesa.tomar_completar'],
];

export type ResultadoAprobacion =
  { permitido: true } | { permitido: false; motivo: 'APROBAR_LO_PROPIO' | 'SIN_PERMISO' };

/** Nadie aprueba su propia solicitud (PROYECTO.md §5.12 y §6). */
export function comprobarAprobacion(
  solicitanteId: string,
  aprobadorId: string,
  aprobadorTieneElPermiso: boolean,
): ResultadoAprobacion {
  if (solicitanteId === aprobadorId) return { permitido: false, motivo: 'APROBAR_LO_PROPIO' };
  if (!aprobadorTieneElPermiso) return { permitido: false, motivo: 'SIN_PERMISO' };
  return { permitido: true };
}
