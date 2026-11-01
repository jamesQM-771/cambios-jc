import { useQuery } from '@tanstack/react-query';

import { cumplimientoCliente, listarAlertas, listarEntradas, obtenerParametros } from './api.js';
import type { EstadoAlerta } from './tipos.js';

export const CLAVE_CUMPLIMIENTO = ['cumplimiento'] as const;

export const useAlertas = (estado: EstadoAlerta | undefined) =>
  useQuery({
    queryKey: [...CLAVE_CUMPLIMIENTO, 'alertas', estado ?? 'todas'],
    queryFn: () => listarAlertas(estado),
  });

export const useListaRestrictiva = (habilitado: boolean) =>
  useQuery({
    queryKey: [...CLAVE_CUMPLIMIENTO, 'lista'],
    queryFn: listarEntradas,
    enabled: habilitado,
  });

export const useParametros = (habilitado: boolean) =>
  useQuery({
    queryKey: [...CLAVE_CUMPLIMIENTO, 'parametros'],
    queryFn: obtenerParametros,
    enabled: habilitado,
  });

export const useCumplimientoCliente = (id: string) =>
  useQuery({
    queryKey: [...CLAVE_CUMPLIMIENTO, 'cliente', id],
    queryFn: () => cumplimientoCliente(id),
  });
