import { api } from '../../lib/api.js';

import type { CambiosSucursal, DatosSucursalNueva, Sucursal } from './tipos.js';

export const listarSucursalesTodas = () => api.get<{ sucursales: Sucursal[] }>('/sucursales');

export const crearSucursal = (datos: DatosSucursalNueva) =>
  api.post<{ sucursal: Sucursal }>('/sucursales', datos);

export const editarSucursal = (id: string, cambios: CambiosSucursal) =>
  api.patch<{ sucursal: Sucursal }>(`/sucursales/${id}`, cambios);

export const desactivarSucursal = (id: string) =>
  api.post<{ sucursal: Sucursal }>(`/sucursales/${id}/desactivar`);

export const reactivarSucursal = (id: string) =>
  api.post<{ sucursal: Sucursal }>(`/sucursales/${id}/reactivar`);
