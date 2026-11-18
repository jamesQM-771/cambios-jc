import { api } from '../../lib/api.js';

import type {
  Alerta,
  CumplimientoCliente,
  EntradaLista,
  EstadoAlerta,
  Parametros,
} from './tipos.js';

export const listarAlertas = (estado: EstadoAlerta | undefined) =>
  api.get<{ alertas: Alerta[] }>('/cumplimiento/alertas', { estado });
export const resolverAlerta = (
  id: string,
  accion: 'descartar' | 'escalar',
  justificacion: string,
) => api.post<{ alerta: Alerta }>(`/cumplimiento/alertas/${id}/${accion}`, { justificacion });
export const listarEntradas = () => api.get<{ entradas: EntradaLista[] }>('/cumplimiento/lista');
export const crearEntrada = (datos: {
  fuente: EntradaLista['fuente'];
  nombre: string;
  numeroDocumento: string | null;
  nota: string | null;
}) => api.post<{ entrada: EntradaLista }>('/cumplimiento/lista', datos);
export const cambiarEntrada = (id: string, activa: boolean) =>
  api.patch<{ entrada: EntradaLista }>(`/cumplimiento/lista/${id}`, { activa });
export const obtenerParametros = () =>
  api.get<{ parametros: Parametros }>('/cumplimiento/parametros');
export const guardarParametros = (datos: Parametros) =>
  api.put<{ parametros: Parametros }>('/cumplimiento/parametros', datos);
export const cumplimientoCliente = (id: string) =>
  api.get<CumplimientoCliente>(`/cumplimiento/clientes/${id}`);
export const guardarFicha = (
  id: string,
  datos: {
    actividadEconomica: string | null;
    origenFondos: string | null;
    direccion: string | null;
    pep: boolean;
  },
) => api.put<{ ok: true }>(`/cumplimiento/clientes/${id}/ficha`, datos);
export const guardarNivel = (id: string, datos: { nivel: string; motivo: string }) =>
  api.put<{ ok: true }>(`/cumplimiento/clientes/${id}/nivel`, datos);
