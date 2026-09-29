/**
 * Roles de Cambios JC (D8, D28). Coinciden con el enum `rol` de la base de datos.
 * Supervisor y oficial de cumplimiento se descartaron: el administrador cumple esas funciones.
 */
export const ROLES = ['administrador', 'vendedor', 'digitador'] as const;

export type Rol = (typeof ROLES)[number];

export function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
}
