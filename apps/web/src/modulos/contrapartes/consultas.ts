import { useQuery } from '@tanstack/react-query';

import {
  detalleContraparte,
  listarContrapartes,
  opcionesContraparte,
  resumenContrapartes,
} from './api.js';

/** Todo lo de contrapartes cuelga de esta clave: invalidarla refresca listas, detalle y resumen. */
export const CLAVE_CONTRAPARTES = ['contrapartes'] as const;

export function useContrapartes(saldo: 'me_deben' | 'les_debo' | undefined) {
  return useQuery({
    queryKey: [...CLAVE_CONTRAPARTES, 'lista', saldo ?? 'todas'],
    queryFn: () => listarContrapartes({ saldo }),
  });
}

export function useResumenContrapartes() {
  return useQuery({ queryKey: [...CLAVE_CONTRAPARTES, 'resumen'], queryFn: resumenContrapartes });
}

export function useDetalleContraparte(id: string | null) {
  return useQuery({
    queryKey: [...CLAVE_CONTRAPARTES, 'detalle', id],
    queryFn: () => detalleContraparte(id ?? ''),
    enabled: id !== null,
  });
}

export function useOpcionesContraparte(habilitado: boolean) {
  return useQuery({
    queryKey: [...CLAVE_CONTRAPARTES, 'opciones'],
    queryFn: opcionesContraparte,
    enabled: habilitado,
  });
}
