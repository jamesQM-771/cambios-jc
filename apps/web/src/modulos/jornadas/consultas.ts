import { useQuery } from '@tanstack/react-query';

import { detalleJornada, listarJornadas } from './api.js';
import type { EstadoJornada } from './tipos.js';

/** Todo lo de jornadas cuelga de esta clave: invalidarla refresca la lista y el detalle abierto. */
export const CLAVE_JORNADAS = ['jornadas'] as const;

export function useJornadas(estado?: EstadoJornada) {
  return useQuery({
    queryKey: [...CLAVE_JORNADAS, 'lista', estado ?? 'todas'],
    queryFn: () => listarJornadas(estado),
  });
}

export function useDetalleJornada(id: string | null) {
  return useQuery({
    queryKey: [...CLAVE_JORNADAS, 'detalle', id],
    queryFn: () => detalleJornada(id ?? ''),
    enabled: id !== null,
  });
}
