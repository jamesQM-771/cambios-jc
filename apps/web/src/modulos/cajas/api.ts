import { api } from '../../lib/api.js';

import type { CambiosCaja, Caja, DatosCajaNueva } from './tipos.js';

export const listarCajas = () => api.get<{ cajas: Caja[] }>('/cajas');

export const crearCaja = (datos: DatosCajaNueva) => api.post<{ caja: Caja }>('/cajas', datos);

export const editarCaja = (id: string, cambios: CambiosCaja) =>
  api.patch<{ caja: Caja }>(`/cajas/${id}`, cambios);

export const desactivarCaja = (id: string) => api.post<{ caja: Caja }>(`/cajas/${id}/desactivar`);

export const reactivarCaja = (id: string) => api.post<{ caja: Caja }>(`/cajas/${id}/reactivar`);
