import { useQuery } from '@tanstack/react-query';

import { listarBancos } from './api.js';

export const CLAVE_BANCOS = ['bancos'] as const;

export function useBancos() {
  return useQuery({ queryKey: CLAVE_BANCOS, queryFn: listarBancos });
}
