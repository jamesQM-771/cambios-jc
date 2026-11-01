import { api } from '../../lib/api.js';

import type { DatosDivisa, OpcionesDivisa, OperacionDivisa, ReciboDivisa } from './tipos.js';

export const listarDivisas = () => api.get<{ operaciones: OperacionDivisa[] }>('/divisas');
export const opcionesDivisa = () => api.get<OpcionesDivisa>('/divisas/opciones');
export const registrarDivisa = (datos: DatosDivisa) =>
  api.post<{ operacion: OperacionDivisa }>('/divisas', datos);
export const anularDivisa = (id: string, motivo: string) =>
  api.post<{ operacion: OperacionDivisa }>(`/divisas/${id}/anular`, { motivo });
export const imprimirDivisa = (id: string) =>
  api.post<{ recibo: ReciboDivisa }>(`/divisas/${id}/imprimir`);
