import { useQuery } from '@tanstack/react-query';

import { buscarClientes, listarBancosDisponibles, obtenerCliente } from './api.js';

export const CLAVE_CLIENTES = ['clientes'] as const;

/** Búsqueda por documento o nombre. Sin texto devuelve los primeros de la lista. */
export function useClientes(busqueda: string) {
  return useQuery({
    queryKey: [...CLAVE_CLIENTES, 'lista', busqueda],
    queryFn: () => buscarClientes(busqueda.trim() === '' ? undefined : busqueda.trim()),
  });
}

export function useBancosDisponibles() {
  return useQuery({
    queryKey: [...CLAVE_CLIENTES, 'bancos'],
    queryFn: listarBancosDisponibles,
  });
}

export function useCliente(id: string | null) {
  return useQuery({
    queryKey: [...CLAVE_CLIENTES, 'detalle', id],
    queryFn: () => obtenerCliente(id ?? ''),
    enabled: id !== null,
  });
}
