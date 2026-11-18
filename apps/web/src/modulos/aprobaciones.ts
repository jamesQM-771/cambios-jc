import { api } from '../lib/api.js';

export type AccionAprobacion =
  | 'reabrir_jornada'
  | 'devolver_remesa'
  | 'anular_remesa'
  | 'anular_divisa'
  | 'anular_compra'
  | 'anular_gasto'
  | 'anular_traslado'
  | 'ajuste_contraparte'
  | 'ajuste_inventario';

export interface Solicitud {
  id: string;
  accion: AccionAprobacion;
  entidadId: string;
  descripcion: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  solicitante: { id: string; nombre: string };
  aprobador: { id: string; nombre: string } | null;
  comentario: string | null;
  resueltaEn: string | null;
  creadoEn: string;
}

export interface ParametrosDobleControl {
  reaperturaJornada: boolean;
  devoluciones: boolean;
  anulaciones: boolean;
  ajustes: boolean;
}

export const ETIQUETAS_ACCION: Record<AccionAprobacion, string> = {
  reabrir_jornada: 'Reabrir jornada',
  devolver_remesa: 'Devolver remesa',
  anular_remesa: 'Anular remesa',
  anular_divisa: 'Anular operación de divisas',
  anular_compra: 'Anular compra',
  anular_gasto: 'Anular gasto',
  anular_traslado: 'Anular traslado',
  ajuste_contraparte: 'Ajuste de contraparte',
  ajuste_inventario: 'Ajuste de inventario',
};

export const listarSolicitudes = (estado: Solicitud['estado'] | undefined) =>
  api.get<{ solicitudes: Solicitud[] }>('/aprobaciones', { estado });
export const aprobarSolicitud = (id: string) =>
  api.post<{ solicitud: Solicitud }>(`/aprobaciones/${id}/aprobar`);
export const rechazarSolicitud = (id: string, comentario: string) =>
  api.post<{ solicitud: Solicitud }>(`/aprobaciones/${id}/rechazar`, { comentario });
export const obtenerParametrosDobleControl = () =>
  api.get<{ parametros: ParametrosDobleControl }>('/aprobaciones/parametros');
export const guardarParametrosDobleControl = (datos: ParametrosDobleControl) =>
  api.put<{ parametros: ParametrosDobleControl }>('/aprobaciones/parametros', datos);
