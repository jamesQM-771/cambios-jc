import { useQuery } from '@tanstack/react-query';

import { listarCategoriasGasto } from './api.js';

export const CLAVE_CATEGORIAS_GASTO = ['categorias-gasto'] as const;

export function useCategoriasGasto() {
  return useQuery({ queryKey: CLAVE_CATEGORIAS_GASTO, queryFn: listarCategoriasGasto });
}
