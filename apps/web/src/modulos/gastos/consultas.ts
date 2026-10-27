import { useQuery } from '@tanstack/react-query';

import { listarGastos, opcionesGasto } from './api.js';
import type { TipoGasto } from './tipos.js';

/** Todo lo de gastos cuelga de esta clave: invalidarla refresca la lista y las opciones. */
export const CLAVE_GASTOS = ['gastos'] as const;

export function useOpcionesGasto(habilitado = true) {
  return useQuery({
    queryKey: [...CLAVE_GASTOS, 'opciones'],
    queryFn: opcionesGasto,
    enabled: habilitado,
  });
}

export function useGastos(habilitado: boolean, tipo?: TipoGasto) {
  return useQuery({
    queryKey: [...CLAVE_GASTOS, 'lista', tipo ?? 'todos'],
    queryFn: () => listarGastos(tipo),
    enabled: habilitado,
  });
}
