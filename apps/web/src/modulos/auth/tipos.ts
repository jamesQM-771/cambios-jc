import type { Permiso, Rol } from '@cambios-jc/shared';

export type PasoSiguiente = 'cambiar_contrasena' | 'configurar_2fa' | 'verificar_2fa';

export interface EmpresaSesion {
  nombre: string;
  nit: string | null;
  telefono: string | null;
  whatsapp: string | null;
  direccion: string | null;
  /** Dirección de la API desde donde se descarga el logo (se usa con `urlApi`). */
  logoUrl: string | null;
  monedaLocal: string;
  zonaHoraria: string;
  textoPieRecibo: string | null;
}

export interface UsuarioSesion {
  id: string;
  nombre: string;
  login: string;
  rol: Rol;
}

/** Respuesta de `GET /auth/yo`. */
export interface Sesion {
  usuario: UsuarioSesion;
  permisos: Permiso[];
  empresa: EmpresaSesion | null;
}

export interface Configuracion2fa {
  secreto: string;
  otpauthUrl: string;
  /** Imagen PNG del QR como `data:image/png;base64,...`. */
  qr: string;
}
