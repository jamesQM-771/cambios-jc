import { api } from '../../lib/api.js';

import type { CambiosCuenta, CuentaDinero, DatosCuentaNueva } from './tipos.js';

export const listarCuentas = () => api.get<{ cuentas: CuentaDinero[] }>('/cuentas-dinero');

export const crearCuenta = (datos: DatosCuentaNueva) =>
  api.post<{ cuenta: CuentaDinero }>('/cuentas-dinero', datos);

export const editarCuenta = (id: string, cambios: CambiosCuenta) =>
  api.patch<{ cuenta: CuentaDinero }>(`/cuentas-dinero/${id}`, cambios);

export const desactivarCuenta = (id: string) =>
  api.post<{ cuenta: CuentaDinero }>(`/cuentas-dinero/${id}/desactivar`);

export const reactivarCuenta = (id: string) =>
  api.post<{ cuenta: CuentaDinero }>(`/cuentas-dinero/${id}/reactivar`);
