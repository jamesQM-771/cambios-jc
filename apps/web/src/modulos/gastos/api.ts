import { api } from '../../lib/api.js';

import type { DatosGasto, Gasto, OpcionesGasto, TipoGasto } from './tipos.js';

export const opcionesGasto = () => api.get<OpcionesGasto>('/gastos/opciones');

export const listarGastos = (tipo?: TipoGasto) =>
  api.get<{ gastos: Gasto[] }>(tipo ? `/gastos?tipo=${tipo}` : '/gastos');

export const registrarGasto = (datos: DatosGasto) => api.post<{ gasto: Gasto }>('/gastos', datos);

export const anularGasto = (id: string, motivo: string) =>
  api.post<{ gasto: Gasto }>(`/gastos/${id}/anular`, { motivo });
