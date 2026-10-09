import { useQuery } from '@tanstack/react-query';

import { listarSucursalesTodas } from './api.js';

// Distinta de ['sucursales'] (modulos/usuarios/consultas.ts), que solo trae las activas: mezclar
// las dos claves metería en la misma caché una lista completa y una filtrada.
export const CLAVE_SUCURSALES = ['sucursales', 'todas'] as const;

export function useSucursalesTodas() {
  return useQuery({ queryKey: CLAVE_SUCURSALES, queryFn: listarSucursalesTodas });
}
