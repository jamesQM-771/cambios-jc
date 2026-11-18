import { api } from '../../lib/api.js';

export interface LiquidezMoneda {
  moneda: string;
  disponible: string;
  comprometido: string;
  libre: string;
  cuentas: {
    id: string;
    nombre: string;
    saldo: string;
    limiteDiario: string | null;
    usadoHoy: string;
    restanteHoy: string | null;
  }[];
}

export interface ParametrosLiquidez {
  umbralLibre: string | null;
  porcentajeLimite: number | null;
}

export interface TableroLiquidez {
  monedas: LiquidezMoneda[];
  comprasEnTransito: { id: string; nombre: string; saldo: string }[];
  alertas: { tipo: 'libre_bajo' | 'limite_cuenta' | 'cola_rapida'; mensaje: string }[];
  parametros: ParametrosLiquidez;
}

export const obtenerLiquidez = () => api.get<TableroLiquidez>('/liquidez');
export const alcanzaLiquidez = (lineaNegocioId: string, bolivares: string) =>
  api.get<{ alcanza: boolean }>('/liquidez/alcanza', { lineaNegocioId, bolivares });
export const guardarParametrosLiquidez = (datos: ParametrosLiquidez) =>
  api.put<{ parametros: ParametrosLiquidez }>('/liquidez/parametros', datos);
