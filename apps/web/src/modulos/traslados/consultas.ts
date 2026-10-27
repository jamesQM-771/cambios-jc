import { useQuery } from '@tanstack/react-query';

import { listarTraslados, opcionesTraslado } from './api.js';

/** Todo lo de traslados cuelga de esta clave: invalidarla refresca la lista y las opciones. */
export const CLAVE_TRASLADOS = ['traslados'] as const;

export function useOpcionesTraslado(habilitado = true) {
  return useQuery({
    queryKey: [...CLAVE_TRASLADOS, 'opciones'],
    queryFn: opcionesTraslado,
    enabled: habilitado,
  });
}

export function useTraslados(habilitado: boolean) {
  return useQuery({
    queryKey: [...CLAVE_TRASLADOS, 'lista'],
    queryFn: listarTraslados,
    enabled: habilitado,
  });
}
