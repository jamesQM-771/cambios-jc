import { api } from '../../lib/api.js';

import type { Banco, CambiosBanco, DatosBancoNuevo } from './tipos.js';

export const listarBancos = () => api.get<{ bancos: Banco[] }>('/bancos');

export const crearBanco = (datos: DatosBancoNuevo) => api.post<{ banco: Banco }>('/bancos', datos);

export const editarBanco = (id: string, cambios: CambiosBanco) =>
  api.patch<{ banco: Banco }>(`/bancos/${id}`, cambios);

export const desactivarBanco = (id: string) =>
  api.post<{ banco: Banco }>(`/bancos/${id}/desactivar`);

export const reactivarBanco = (id: string) => api.post<{ banco: Banco }>(`/bancos/${id}/reactivar`);
