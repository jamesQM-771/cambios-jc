import { api } from '../../lib/api.js';

import type { DatosCerrarJornada, DetalleJornada, EstadoJornada, Jornada } from './tipos.js';

export const listarJornadas = (estado?: EstadoJornada) =>
  api.get<{ jornadas: Jornada[] }>(estado ? `/jornadas?estado=${estado}` : '/jornadas');

export const detalleJornada = (id: string) =>
  api.get<{ detalle: DetalleJornada }>(`/jornadas/${id}`);

export const cerrarJornada = (id: string, datos: DatosCerrarJornada) =>
  api.post<{ detalle: DetalleJornada }>(`/jornadas/${id}/cerrar`, datos);

export const reabrirJornada = (id: string, motivo: string) =>
  api.post<{ detalle: DetalleJornada }>(`/jornadas/${id}/reabrir`, { motivo });
