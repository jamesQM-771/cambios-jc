import { useQuery } from '@tanstack/react-query';

import { listarCompras, opcionesCompra } from './api.js';

export const CLAVE_COMPRAS = ['compras'] as const;

export function useCompras() {
  return useQuery({ queryKey: [...CLAVE_COMPRAS, 'lista'], queryFn: listarCompras });
}

export function useOpcionesCompra(habilitado: boolean) {
  return useQuery({
    queryKey: [...CLAVE_COMPRAS, 'opciones'],
    queryFn: opcionesCompra,
    enabled: habilitado,
  });
}
