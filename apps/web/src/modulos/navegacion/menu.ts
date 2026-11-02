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
    ruta: '/turno',
    grupo: 'Operación',
    icono: 'turno',
    etiqueta: 'Mi turno',
    descripcion: 'Abrir y cerrar tu caja contando el efectivo',
    permiso: 'turno.gestionar_propio',
  },
  {
    ruta: '/remesas',
    grupo: 'Operación',
    icono: 'remesa',
    etiqueta: 'Remesas',
    descripcion: 'Registrar envíos, verificar pagos y seguir cada remesa',
    permiso: 'remesa.registrar',
  },
  {
    ruta: '/divisas',
    grupo: 'Operación',
    icono: 'divisas',
    etiqueta: 'Divisas',
    descripcion: 'Comprar y vender dólares en efectivo, contando los billetes',
    permiso: 'divisa_caja.operar',
  },
  {
    ruta: '/traslados',
    grupo: 'Operación',
    icono: 'traslado',
    etiqueta: 'Traslados',
    descripcion: 'Pasar dinero entre la caja, la bóveda y los bancos',
    permiso: 'traslado.registrar',
  },
  {
    ruta: '/gastos',
    grupo: 'Operación',
    icono: 'gasto',
    etiqueta: 'Gastos',
    descripcion: 'Registrar lo que se paga con el dinero del negocio',
    permiso: 'gasto.registrar',
  },
  {
    ruta: '/jornada',
    grupo: 'Operación',
    icono: 'jornada',
    etiqueta: 'Jornada',
    descripcion: 'Cerrar el día: turnos, arqueo de cuentas y resumen',
    permiso: 'jornada.cerrar',
  },
  {
    ruta: '/liquidez',
    grupo: 'Operación',
    icono: 'liquidez',
    etiqueta: 'Liquidez',
    descripcion: 'Bolívares disponibles frente a la cola por pagar',
    permiso: 'liquidez.ver',
  },
  {
    ruta: '/contrapartes',
    grupo: 'Operación',
    icono: 'balanza',
    etiqueta: 'Contrapartes',
    descripcion: 'Lo que te deben y lo que debes: préstamos, abonos y anticipos',
    permiso: 'contraparte.registrar_movimiento',
  },
  {
    ruta: '/compras',
    grupo: 'Operación',
    icono: 'compras',
    etiqueta: 'Compras',
    descripcion: 'Bolívares comprados a proveedores, de contado o a crédito',
    permiso: 'compra_contraparte.registrar',
  },
  {
    ruta: '/inventario',
    grupo: 'Operación',
    icono: 'inventario',
    etiqueta: 'Inventario',
    descripcion: 'Bolívares por pagar y su costo promedio',
    permiso: 'compra_contraparte.registrar',
  },
  {
    ruta: '/clientes',
    grupo: 'Operación',
    icono: 'cliente',
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
    ruta: '/reportes',
    grupo: 'Administración',
    icono: 'reportes',
    etiqueta: 'Reportes',
    descripcion: 'Tablero del dueño, reportes, histórico y datos del negocio',
    permiso: 'reporte.ver',
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
    ruta: '/permisos',
    grupo: 'Administración',
    icono: 'candado',
    etiqueta: 'Permisos',
    descripcion: 'Qué puede hacer cada rol',
    permiso: 'permiso.configurar',
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
  {
    ruta: '/cumplimiento',
    grupo: 'Seguridad',
    icono: 'escudo',
    etiqueta: 'Cumplimiento',
    descripcion: 'Alertas SARLAFT, lista restrictiva y exportes',
    permiso: 'cumplimiento.gestionar_alertas',
  },
  {
    ruta: '/aprobaciones',
    grupo: 'Seguridad',
    icono: 'aprobar',
    etiqueta: 'Aprobaciones',
    descripcion: 'Doble control: aprobar o rechazar lo que pidió otra persona',
    permiso: 'aprobacion.aprobar',
  },
];

export const entradasVisibles = (permisos: readonly Permiso[]): EntradaMenu[] =>
  ENTRADAS_MENU.filter((entrada) => !entrada.permiso || permisos.includes(entrada.permiso));
