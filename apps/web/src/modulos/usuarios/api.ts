import { api } from '../../lib/api.js';

import type {
  CambiosUsuario,
  DatosUsuarioNuevo,
  FiltrosUsuarios,
  ListaUsuarios,
  Sucursal,
  UsuarioConContrasenaTemporal,
  UsuarioLista,
} from './tipos.js';

export const listarUsuarios = (filtros: FiltrosUsuarios) =>
  api.get<ListaUsuarios>('/usuarios', {
    busqueda: filtros.busqueda,
    rol: filtros.rol,
    activo: filtros.activo,
    pagina: filtros.pagina,
    porPagina: filtros.porPagina,
  });

export const listarSucursales = () => api.get<{ sucursales: Sucursal[] }>('/sucursales');

export const crearUsuario = (datos: DatosUsuarioNuevo) =>
  api.post<UsuarioConContrasenaTemporal>('/usuarios', datos);

export const editarUsuario = (id: string, cambios: CambiosUsuario) =>
  api.patch<{ usuario: UsuarioLista }>(`/usuarios/${id}`, cambios);

export const desactivarUsuario = (id: string) =>
  api.post<{ usuario: UsuarioLista }>(`/usuarios/${id}/desactivar`);

export const reactivarUsuario = (id: string) =>
  api.post<{ usuario: UsuarioLista }>(`/usuarios/${id}/reactivar`);

export const restablecerContrasena = (id: string) =>
  api.post<UsuarioConContrasenaTemporal>(`/usuarios/${id}/restablecer-contrasena`);

export const reiniciar2fa = (id: string) => api.post<{ ok: true }>(`/usuarios/${id}/reiniciar-2fa`);

export const cerrarSesiones = (id: string) =>
  api.post<{ sesionesCerradas: number }>(`/usuarios/${id}/cerrar-sesiones`);
