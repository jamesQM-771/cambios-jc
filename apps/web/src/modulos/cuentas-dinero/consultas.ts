import { useQuery } from '@tanstack/react-query';

import { listarCuentas } from './api.js';

export const CLAVE_CUENTAS = ['cuentas-dinero'] as const;

export function useCuentas() {
  return useQuery({ queryKey: CLAVE_CUENTAS, queryFn: listarCuentas });
}
