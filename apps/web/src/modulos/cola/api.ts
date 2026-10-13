import { api } from '../../lib/api.js';

import type { DatosCompletar, ItemCola, RespuestaCola } from './tipos.js';

export const obtenerCola = () => api.get<RespuestaCola>('/cola');

export const tomarTransferencia = (id: string) =>
  api.post<{ remesa: ItemCola }>(`/cola/${id}/tomar`);

export const devolverALaCola = (id: string) => api.post<unknown>(`/cola/${id}/devolver`);

export const reportarIncidencia = (id: string, motivo: string) =>
  api.post<unknown>(`/cola/${id}/incidencia`, { motivo });

/** Cierra la transferencia: la captura va como archivo y los demás datos como campos del formulario. */
export function completarTransferencia(id: string, datos: DatosCompletar) {
  const formulario = new FormData();
  formulario.set('cuentaOrigenId', datos.cuentaOrigenId);
  if (datos.referenciaBancaria) formulario.set('referenciaBancaria', datos.referenciaBancaria);
  if (datos.costoBancario) formulario.set('costoBancario', datos.costoBancario);
  formulario.set('comprobante', datos.captura, 'comprobante.jpg');
  return api.subir<unknown>(`/cola/${id}/completar`, formulario);
}
