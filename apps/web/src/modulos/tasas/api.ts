import { api, type ValorConsulta } from '../../lib/api.js';

import type { DatosPublicarTasa, Tasa } from './tipos.js';

export interface FiltrosTasas extends Record<string, ValorConsulta> {
  lineaNegocioId?: string;
  vigente?: boolean;
}

export const listarTasas = (filtros: FiltrosTasas) => api.get<{ tasas: Tasa[] }>('/tasas', filtros);

export const publicarTasa = (datos: DatosPublicarTasa) => api.post<{ tasa: Tasa }>('/tasas', datos);
