import { api } from '../../lib/api.js';

import type { DatosAbrirTurno, DatosCerrarTurno, OpcionesTurno, Turno } from './tipos.js';

export const opcionesTurno = () => api.get<OpcionesTurno>('/turnos/opciones');

export const abrirTurno = (datos: DatosAbrirTurno) => api.post<{ turno: Turno }>('/turnos', datos);

export const cerrarTurno = (id: string, datos: DatosCerrarTurno) =>
  api.post<{ turno: Turno }>(`/turnos/${id}/cerrar`, datos);
