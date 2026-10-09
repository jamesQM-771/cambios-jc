import { useQuery } from '@tanstack/react-query';

import { listarTasas, type FiltrosTasas } from './api.js';

export const CLAVE_TASAS = ['tasas'] as const;

export function useTasas(filtros: FiltrosTasas) {
  return useQuery({
    queryKey: [...CLAVE_TASAS, filtros],
    queryFn: () => listarTasas(filtros),
  });
}
