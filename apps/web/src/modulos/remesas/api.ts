import { api } from '../../lib/api.js';

import type {
  DatosRemesaNueva,
  EstadoRemesa,
  EventoRemesa,
  OpcionesRemesa,
  Remesa,
} from './tipos.js';

export const listarRemesas = (estado?: EstadoRemesa) =>
  api.get<{ remesas: Remesa[] }>('/remesas', { estado });

export const obtenerRemesa = (id: string) => api.get<{ remesa: Remesa }>(`/remesas/${id}`);

export const historialRemesa = (id: string) =>
  api.get<{ historial: EventoRemesa[] }>(`/remesas/${id}/historial`);

export const opcionesRemesa = () => api.get<OpcionesRemesa>('/remesas/opciones');

/** Registra una remesa. Un reintento con la misma `claveIdempotencia` devuelve la ya creada. */
export const registrarRemesa = (datos: DatosRemesaNueva) =>
  api.post<{ remesa: Remesa }>('/remesas', datos);

export const verificarPago = (id: string) =>
  api.post<{ remesa: Remesa }>(`/remesas/${id}/verificar-pago`);

export const anularRemesa = (id: string, motivo: string) =>
  api.post<{ remesa: Remesa }>(`/remesas/${id}/anular`, { motivo });

/** Devuelve al cliente el dinero de una remesa con incidencia, por la misma cuenta por la que entró. */
export const devolverRemesa = (id: string, motivo: string) =>
  api.post<{ remesa: Remesa }>(`/remesas/${id}/devolver`, { motivo });

export const corregirRemesa = (id: string, medioPagoId: string, nota?: string) =>
  api.post<{ remesa: Remesa }>(`/remesas/${id}/corregir`, { medioPagoId, nota });

export const liberarRemesa = (id: string) => api.post<{ remesa: Remesa }>(`/remesas/${id}/liberar`);
