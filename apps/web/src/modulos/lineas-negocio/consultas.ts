import { useQuery } from '@tanstack/react-query';

import { listarLineasNegocio } from './api.js';

export const CLAVE_LINEAS_NEGOCIO = ['lineas-negocio'] as const;

export function useLineasNegocio() {
  return useQuery({ queryKey: CLAVE_LINEAS_NEGOCIO, queryFn: listarLineasNegocio });
}
