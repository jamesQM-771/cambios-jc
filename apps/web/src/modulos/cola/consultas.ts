import { useQuery } from '@tanstack/react-query';

import { obtenerCola } from './api.js';

export const CLAVE_COLA = ['cola'] as const;

/** Cada cuántos milisegundos se vuelve a pedir la cola si el aviso en vivo no llegó (mala conexión). */
export const RESPALDO_COLA_MS = 15_000;

export function useCola() {
  return useQuery({
    queryKey: CLAVE_COLA,
    queryFn: obtenerCola,
    // Los avisos en vivo la refrescan al instante; esto cubre el caso en que el teléfono pierda
    // la conexión en tiempo real y sigue con datos que pueden quedar viejos.
    refetchInterval: RESPALDO_COLA_MS,
  });
}
