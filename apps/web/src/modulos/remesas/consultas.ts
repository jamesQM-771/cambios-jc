import { useQuery } from '@tanstack/react-query';

import { gananciaRemesa, historialRemesa, listarRemesas, opcionesRemesa } from './api.js';
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

/** Solo se pide si la persona tiene `ganancia.ver` y la remesa ya se pagó. */
export function useGananciaRemesa(id: string, habilitado: boolean) {
  return useQuery({
    queryKey: [...CLAVE_REMESAS, 'ganancia', id],
    queryFn: () => gananciaRemesa(id),
    enabled: habilitado,
  });
}

export function useOpcionesRemesa(habilitado = true) {
  return useQuery({
    queryKey: [...CLAVE_REMESAS, 'opciones'],
    queryFn: opcionesRemesa,
    enabled: habilitado,
  });
}
