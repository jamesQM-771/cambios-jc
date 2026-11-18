import { useQuery } from '@tanstack/react-query';

import { listarDivisas, opcionesDivisa } from './api.js';

export const CLAVE_DIVISAS = ['divisas'] as const;

export function useDivisas() {
  return useQuery({ queryKey: [...CLAVE_DIVISAS, 'lista'], queryFn: listarDivisas });
}

export function useOpcionesDivisa(habilitado: boolean) {
  return useQuery({
    queryKey: [...CLAVE_DIVISAS, 'opciones'],
    queryFn: opcionesDivisa,
    enabled: habilitado,
  });
}
