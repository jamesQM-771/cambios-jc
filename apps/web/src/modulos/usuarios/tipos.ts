import type { Rol } from '@cambios-jc/shared';

export interface UsuarioLista {
  id: string;
  nombre: string;
  login: string;
  rol: Rol;
  sucursalId: string | null;
  sucursalNombre: string | null;
  activo: boolean;
  tiene2fa: boolean;
  debeCambiarContrasena: boolean;
  bloqueadoHasta: string | null;
  ultimoAcceso: string | null;
  creadoEn: string;
}

export interface ListaUsuarios {
  usuarios: UsuarioLista[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface Sucursal {
  id: string;
  nombre: string;
  ciudad: string;
}

export interface FiltrosUsuarios {
  busqueda: string;
  rol: Rol | '';
  activo: '' | 'true' | 'false';
  pagina: number;
  porPagina: number;
}

export interface DatosUsuarioNuevo {
  nombre: string;
  login: string;
  rol: Rol;
  sucursalId: string | null;
}

export interface CambiosUsuario {
  nombre?: string;
  rol?: Rol;
  sucursalId?: string | null;
}

/** La contraseña temporal solo llega en esta respuesta: no se vuelve a poder consultar. */
export interface UsuarioConContrasenaTemporal {
  usuario: UsuarioLista;
  contrasenaTemporal: string;
}
