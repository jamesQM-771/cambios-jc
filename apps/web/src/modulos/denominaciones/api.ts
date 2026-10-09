import { api } from '../../lib/api.js';

import type { CambiosDenominacion, DatosDenominacionNueva, Denominacion } from './tipos.js';

export const listarDenominaciones = () =>
  api.get<{ denominaciones: Denominacion[] }>('/denominaciones');

export const crearDenominacion = (datos: DatosDenominacionNueva) =>
  api.post<{ denominacion: Denominacion }>('/denominaciones', datos);

export const editarDenominacion = (id: string, cambios: CambiosDenominacion) =>
  api.patch<{ denominacion: Denominacion }>(`/denominaciones/${id}`, cambios);

export const desactivarDenominacion = (id: string) =>
  api.post<{ denominacion: Denominacion }>(`/denominaciones/${id}/desactivar`);

export const reactivarDenominacion = (id: string) =>
  api.post<{ denominacion: Denominacion }>(`/denominaciones/${id}/reactivar`);
