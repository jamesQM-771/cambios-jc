import { useQuery } from '@tanstack/react-query';

import { listarDenominaciones } from './api.js';

export const CLAVE_DENOMINACIONES = ['denominaciones'] as const;

export function useDenominaciones() {
  return useQuery({ queryKey: CLAVE_DENOMINACIONES, queryFn: listarDenominaciones });
}
