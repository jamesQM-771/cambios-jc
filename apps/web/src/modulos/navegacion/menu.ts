import type { Permiso } from '@cambios-jc/shared';

import type { NombreIcono } from '../../componentes/Icono.js';

/** Grupos del menú, en el orden en que se muestran. */
export const GRUPOS_MENU = ['General', 'Operación', 'Administración', 'Seguridad'] as const;
export type GrupoMenu = (typeof GRUPOS_MENU)[number];

export interface EntradaMenu {
  ruta: string;
  etiqueta: string;
  descripcion: string;
  icono: NombreIcono;
  grupo: GrupoMenu;
  /** Permiso que hace falta para verla. Sin permiso = la ve cualquier usuario con sesión. */
  permiso?: Permiso;
}

/**
 * Menú del sistema. Lo que cada persona ve sale de sus permisos (`GET /auth/yo`), no de su rol:
 * si cambia qué puede hacer cada rol, la web no se toca.
 */
export const ENTRADAS_MENU: readonly EntradaMenu[] = [
  {
    ruta: '/',
    etiqueta: 'Inicio',
    descripcion: 'Resumen y accesos',
    icono: 'inicio',
    grupo: 'General',
  },
  {
    ruta: '/remesas',
    grupo: 'Operación',
    icono: 'flecha',
    etiqueta: 'Remesas',
    descripcion: 'Registrar envíos, verificar pagos y seguir cada remesa',
    permiso: 'remesa.registrar',
  },
  {
    ruta: '/clientes',
    grupo: 'Operación',
    icono: 'usuarios',
    etiqueta: 'Clientes',
    descripcion: 'Quienes envían y reciben dinero, con sus cuentas',
    permiso: 'cliente.registrar',
  },
  {
    ruta: '/cola',
    grupo: 'Operación',
    icono: 'cola',
    etiqueta: 'Cola de pagos',
    descripcion: 'Transferencias por pagar: tomarlas, pagarlas y subir la captura',
    permiso: 'remesa.tomar_completar',
  },
  {
    ruta: '/usuarios',
    grupo: 'Administración',
    icono: 'usuarios',
    etiqueta: 'Usuarios',
    descripcion: 'Crear usuarios, cambiar roles y gestionar su acceso',
    permiso: 'usuario.gestionar',
  },
  {
    ruta: '/empresa',
    grupo: 'Administración',
    icono: 'empresa',
    etiqueta: 'Empresa',
    descripcion: 'Datos de la empresa y logo',
    permiso: 'empresa.configurar',
  },
  {
    ruta: '/configuracion',
    grupo: 'Administración',
    icono: 'configuracion',
    etiqueta: 'Configuración',
    descripcion: 'Sucursales, cajas, denominaciones, líneas de negocio, bancos, cuentas y tasas',
    permiso: 'empresa.configurar',
  },
  {
    ruta: '/bitacora',
    grupo: 'Seguridad',
    icono: 'bitacora',
    etiqueta: 'Actividad',
    descripcion: 'Quién hizo qué y cuándo, con el antes y el después',
    permiso: 'auditoria.ver',
  },
];

export const entradasVisibles = (permisos: readonly Permiso[]): EntradaMenu[] =>
  ENTRADAS_MENU.filter((entrada) => !entrada.permiso || permisos.includes(entrada.permiso));
