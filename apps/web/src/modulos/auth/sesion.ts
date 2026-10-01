import type { Permiso } from '@cambios-jc/shared';
import { useQuery } from '@tanstack/react-query';

import { ErrorApi } from '../../lib/api.js';

import { pedirSesion } from './api.js';
import type { Sesion } from './tipos.js';

/** Clave de la sesión en la caché de consultas: `null` = no hay sesión completa. */
export const CLAVE_SESION = ['sesion'] as const;

/** Errores 401 que significan "no hay una sesión completa" (sin sesión, vencida o a medio acceso). */
export function esFaltaDeSesion(error: unknown): boolean {
  return (
    error instanceof ErrorApi &&
    error.estado === 401 &&
    (error.codigo === 'NO_AUTENTICADO' || error.codigo === 'SESION_INCOMPLETA')
  );
}

async function consultarSesion(): Promise<Sesion | null> {
  try {
    return await pedirSesion();
  } catch (error) {
    if (esFaltaDeSesion(error)) return null;
    throw error;
  }
}

/** La sesión actual: datos si hay una completa, `null` si no, y `undefined` mientras se consulta. */
export function useSesion() {
  return useQuery({ queryKey: CLAVE_SESION, queryFn: consultarSesion });
}

export const tienePermiso = (sesion: Sesion, permiso: Permiso): boolean =>
  sesion.permisos.includes(permiso);
