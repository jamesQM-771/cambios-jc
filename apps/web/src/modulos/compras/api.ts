import { api } from '../../lib/api.js';

import type { Compra, DatosCompra, OpcionesCompra } from './tipos.js';

export const listarCompras = () => api.get<{ compras: Compra[] }>('/compras');
export const opcionesCompra = () => api.get<OpcionesCompra>('/compras/opciones');
export const registrarCompra = (datos: DatosCompra) =>
  api.post<{ compra: Compra }>('/compras', datos);
export const anularCompra = (id: string, motivo: string) =>
  api.post<{ compra: Compra }>(`/compras/${id}/anular`, { motivo });
