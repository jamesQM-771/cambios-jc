import { api } from '../../lib/api.js';

import type {
  Contraparte,
  DatosContraparte,
  DatosMovimiento,
  MovimientoContraparte,
  OpcionesContraparte,
} from './tipos.js';

export const listarContrapartes = (filtro: { saldo?: 'me_deben' | 'les_debo' | undefined }) =>
  api.get<{ contrapartes: Contraparte[] }>('/contrapartes', filtro);

export const detalleContraparte = (id: string) =>
  api.get<{ contraparte: Contraparte; movimientos: MovimientoContraparte[] }>(
    `/contrapartes/${id}`,
  );

export const opcionesContraparte = () => api.get<OpcionesContraparte>('/contrapartes/opciones');

export const resumenContrapartes = () =>
  api.get<{ resumen: { moneda: string; meDeben: string; lesDebo: string }[] }>(
    '/contrapartes/resumen',
  );

export const crearContraparte = (datos: DatosContraparte) =>
  api.post<{ contraparte: Contraparte }>('/contrapartes', datos);

export const editarContraparte = (id: string, datos: Partial<DatosContraparte>) =>
  api.patch<{ contraparte: Contraparte }>(`/contrapartes/${id}`, datos);

export const registrarMovimiento = (id: string, datos: DatosMovimiento) =>
  api.post<{ movimiento: MovimientoContraparte }>(`/contrapartes/${id}/movimientos`, datos);

export const anularMovimiento = (id: string, motivo: string) =>
  api.post<{ movimiento: MovimientoContraparte }>(`/contrapartes/movimientos/${id}/anular`, {
    motivo,
  });
