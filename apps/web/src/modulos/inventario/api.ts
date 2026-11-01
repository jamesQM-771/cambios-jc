import { api } from '../../lib/api.js';

import type { DatosAjuste, Inventario, MovimientoInventario } from './tipos.js';

export const listarInventarios = () => api.get<{ inventarios: Inventario[] }>('/inventario');
export const movimientosInventario = (moneda: string) =>
  api.get<{ movimientos: MovimientoInventario[] }>(`/inventario/${moneda}/movimientos`);
export const ajustarInventario = (moneda: string, datos: DatosAjuste) =>
  api.post<{ inventario: Inventario }>(`/inventario/${moneda}/ajustes`, datos);
