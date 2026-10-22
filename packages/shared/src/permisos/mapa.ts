import { PERMISOS, type Permiso } from './permisos.js';
import type { Rol } from './roles.js';

/** Permisos de cada rol. Es código fijo; en la fase 13 pasará a ser configurable por el dueño. */
export const PERMISOS_POR_ROL: Readonly<Record<Rol, readonly Permiso[]>> = {
  // Todo excepto pagar remesas: eso es exclusivo del digitador ("quien recibe no es quien paga").
  administrador: PERMISOS.filter((permiso) => permiso !== 'remesa.tomar_completar'),

  vendedor: [
    'turno.gestionar_propio',
    'cliente.registrar',
    'remesa.registrar',
    'remesa.verificar_pago',
    'divisa_caja.operar',
    'gasto.registrar',
    'traslado.registrar',
    // 'tasa.cambiar_en_operacion' queda fuera por defecto (D29): quienes venden en Cambios JC
    // entran como administradores. Pregunta abierta #6 de PROYECTO.md §13.
  ],

  // Principio de mínima información: solo toma y completa transferencias (D9).
  digitador: ['remesa.tomar_completar'],
};

/** Permisos de un rol, en el orden del catálogo. */
export function permisosDeRol(rol: Rol): readonly Permiso[] {
  return PERMISOS_POR_ROL[rol];
}

export function tienePermiso(rol: Rol, permiso: Permiso): boolean {
  return PERMISOS_POR_ROL[rol].includes(permiso);
}
