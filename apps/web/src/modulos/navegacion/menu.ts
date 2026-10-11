import type { Permiso } from '@cambios-jc/shared';

import type { NombreIcono } from '../../componentes/Icono.js';

export interface EntradaMenu {
  ruta: string;
  etiqueta: string;
  descripcion: string;
  icono: NombreIcono;
  /** Permiso que hace falta para verla. Sin permiso = la ve cualquier usuario con sesión. */
  permiso?: Permiso;
}

/**
 * Menú del sistema. Lo que cada persona ve sale de sus permisos (`GET /auth/yo`), no de su rol:
 * si cambia qué puede hacer cada rol, la web no se toca.
 */
export const ENTRADAS_MENU: readonly EntradaMenu[] = [
  { ruta: '/', etiqueta: 'Inicio', descripcion: 'Resumen y accesos', icono: 'inicio' },
  {
    ruta: '/usuarios',
    icono: 'usuarios',
    etiqueta: 'Usuarios',
    descripcion: 'Crear usuarios, cambiar roles y gestionar su acceso',
    permiso: 'usuario.gestionar',
  },
  {
    ruta: '/empresa',
    icono: 'empresa',
    etiqueta: 'Empresa',
    descripcion: 'Datos de la empresa y logo',
    permiso: 'empresa.configurar',
  },
  {
    ruta: '/configuracion',
    icono: 'configuracion',
    etiqueta: 'Configuración',
    descripcion: 'Sucursales, cajas, denominaciones, líneas de negocio, bancos, cuentas y tasas',
    permiso: 'empresa.configurar',
  },
  {
    ruta: '/bitacora',
    icono: 'bitacora',
    etiqueta: 'Bitácora',
    descripcion: 'Quién hizo qué y cuándo',
    permiso: 'auditoria.ver',
  },
];

export const entradasVisibles = (permisos: readonly Permiso[]): EntradaMenu[] =>
  ENTRADAS_MENU.filter((entrada) => !entrada.permiso || permisos.includes(entrada.permiso));
