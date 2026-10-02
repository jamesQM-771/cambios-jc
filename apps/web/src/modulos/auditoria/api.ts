import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api.js';

export interface RegistroAuditoria {
  id: string;
  fecha: string;
  usuario: { id: string; login: string; nombre: string } | null;
  accion: string;
  entidad: string;
  entidadId: string | null;
  antes: unknown;
  despues: unknown;
  ip: string | null;
  agenteUsuario: string | null;
}

export interface ListaAuditoria {
  registros: RegistroAuditoria[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface FiltrosAuditoria {
  desde: string;
  hasta: string;
  usuarioId: string;
  accion: string;
  entidad: string;
  pagina: number;
  porPagina: number;
}

export const consultarAuditoria = (filtros: FiltrosAuditoria) =>
  api.get<ListaAuditoria>('/auditoria', { ...filtros });

export function useAuditoria(filtros: FiltrosAuditoria) {
  return useQuery({
    queryKey: ['auditoria', filtros],
    queryFn: () => consultarAuditoria(filtros),
    placeholderData: keepPreviousData,
  });
}
