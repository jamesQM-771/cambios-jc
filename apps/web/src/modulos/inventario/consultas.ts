import { useQuery } from '@tanstack/react-query';

import { listarInventarios, movimientosInventario } from './api.js';

export const CLAVE_INVENTARIO = ['inventario'] as const;

export function useInventarios() {
  return useQuery({ queryKey: [...CLAVE_INVENTARIO, 'lista'], queryFn: listarInventarios });
}

export function useMovimientosInventario(moneda: string | null) {
  return useQuery({
    queryKey: [...CLAVE_INVENTARIO, 'movimientos', moneda],
    queryFn: () => movimientosInventario(moneda ?? ''),
    enabled: moneda !== null,
  });
}
