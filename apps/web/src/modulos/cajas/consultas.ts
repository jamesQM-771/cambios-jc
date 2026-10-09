import { useQuery } from '@tanstack/react-query';

import { listarCajas } from './api.js';

export const CLAVE_CAJAS = ['cajas'] as const;

export function useCajas() {
  return useQuery({ queryKey: CLAVE_CAJAS, queryFn: listarCajas });
}
