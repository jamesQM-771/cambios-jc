import { useQuery } from '@tanstack/react-query';

import { historialRemesa, listarRemesas, opcionesRemesa } from './api.js';
import type { EstadoRemesa } from './tipos.js';

/** Todo lo de remesas cuelga de esta clave: invalidarla refresca lista, detalle e historial. */
export const CLAVE_REMESAS = ['remesas'] as const;

export function useRemesas(estado?: EstadoRemesa) {
  return useQuery({
    queryKey: [...CLAVE_REMESAS, 'lista', estado ?? 'todas'],
    queryFn: () => listarRemesas(estado),
  });
}

export function useHistorialRemesa(id: string | null) {
  return useQuery({
    queryKey: [...CLAVE_REMESAS, 'historial', id],
    queryFn: () => historialRemesa(id ?? ''),
    enabled: id !== null,
  });
}

export function useOpcionesRemesa(habilitado = true) {
  return useQuery({
    queryKey: [...CLAVE_REMESAS, 'opciones'],
    queryFn: opcionesRemesa,
    enabled: habilitado,
  });
}
