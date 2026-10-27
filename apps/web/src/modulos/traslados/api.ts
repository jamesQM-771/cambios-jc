import { api } from '../../lib/api.js';

import type { DatosTraslado, OpcionesTraslado, Traslado } from './tipos.js';

export const opcionesTraslado = () => api.get<OpcionesTraslado>('/traslados/opciones');

export const listarTraslados = () => api.get<{ traslados: Traslado[] }>('/traslados');

export const registrarTraslado = (datos: DatosTraslado) =>
  api.post<{ traslado: Traslado }>('/traslados', datos);

export const anularTraslado = (id: string, motivo: string) =>
  api.post<{ traslado: Traslado }>(`/traslados/${id}/anular`, { motivo });
