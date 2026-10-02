import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listarSucursales, listarUsuarios } from './api.js';
import type { FiltrosUsuarios } from './tipos.js';

/** Todas las consultas de usuarios cuelgan de esta clave: al cambiar un usuario se invalidan juntas. */
export const CLAVE_USUARIOS = ['usuarios'] as const;

export function useUsuarios(filtros: FiltrosUsuarios) {
  return useQuery({
    queryKey: [...CLAVE_USUARIOS, filtros],
    queryFn: () => listarUsuarios(filtros),
    // Al cambiar de página o de filtro se sigue mostrando la tabla anterior hasta que llega la nueva.
    placeholderData: keepPreviousData,
  });
}

export function useSucursales() {
  return useQuery({
    queryKey: ['sucursales'],
    queryFn: async () => (await listarSucursales()).sucursales,
    staleTime: 5 * 60_000,
  });
}
