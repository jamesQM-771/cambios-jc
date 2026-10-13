import { api } from '../../lib/api.js';

import type {
  CambiosCliente,
  Cliente,
  ClienteConMedios,
  DatosClienteNuevo,
  DatosMedioPagoNuevo,
  MedioPago,
} from './tipos.js';

/** Bancos activos, para agregar datos de pago (quien vende no puede abrir Configuración). */
export const listarBancosDisponibles = () =>
  api.get<{ bancos: { id: string; codigo: string; nombre: string }[] }>('/clientes/bancos');

export const buscarClientes = (busqueda?: string) =>
  api.get<{ clientes: Cliente[] }>('/clientes', { busqueda });

export const obtenerCliente = (id: string) =>
  api.get<{ cliente: ClienteConMedios }>(`/clientes/${id}`);

export const crearCliente = (datos: DatosClienteNuevo) =>
  api.post<{ cliente: ClienteConMedios }>('/clientes', datos);

export const editarCliente = (id: string, cambios: CambiosCliente) =>
  api.patch<{ cliente: ClienteConMedios }>(`/clientes/${id}`, cambios);

export const desactivarCliente = (id: string) =>
  api.post<{ cliente: ClienteConMedios }>(`/clientes/${id}/desactivar`);

export const reactivarCliente = (id: string) =>
  api.post<{ cliente: ClienteConMedios }>(`/clientes/${id}/reactivar`);

export const agregarMedioPago = (clienteId: string, datos: DatosMedioPagoNuevo) =>
  api.post<{ medioPago: MedioPago }>(`/clientes/${clienteId}/medios-pago`, datos);

export const desactivarMedioPago = (clienteId: string, medioId: string) =>
  api.post<{ medioPago: MedioPago }>(`/clientes/${clienteId}/medios-pago/${medioId}/desactivar`);

export const reactivarMedioPago = (clienteId: string, medioId: string) =>
  api.post<{ medioPago: MedioPago }>(`/clientes/${clienteId}/medios-pago/${medioId}/reactivar`);
