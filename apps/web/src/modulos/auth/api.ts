import { api } from '../../lib/api.js';

import type { Configuracion2fa, PasoSiguiente, Sesion, UsuarioSesion } from './tipos.js';

export const pedirSesion = () => api.get<Sesion>('/auth/yo');

export const iniciarSesion = (login: string, contrasena: string) =>
  api.post<{ siguientePaso: PasoSiguiente; nombre: string }>('/auth/login', { login, contrasena });

export const cambiarContrasena = (contrasenaActual: string, contrasenaNueva: string) =>
  api.post<{ siguientePaso: PasoSiguiente }>('/auth/contrasena/cambiar', {
    contrasenaActual,
    contrasenaNueva,
  });

export const configurar2fa = () => api.post<Configuracion2fa>('/auth/2fa/configurar');

export const activar2fa = (codigo: string) =>
  api.post<{ usuario: UsuarioSesion }>('/auth/2fa/activar', { codigo });

export const verificar2fa = (codigo: string) =>
  api.post<{ usuario: UsuarioSesion }>('/auth/2fa/verificar', { codigo });

export const cerrarSesion = () => api.post<{ ok: true }>('/auth/logout');
