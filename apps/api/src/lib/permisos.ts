import {
  esPermiso,
  PERMISOS,
  PERMISOS_INCOMPATIBLES,
  PERMISOS_SOLO_ADMINISTRADOR,
  permisosDeRol as permisosDeFabrica,
  type Permiso,
  type Rol,
} from '@cambios-jc/shared';

import type { PrismaClient } from './prisma.js';

/**
 * Permisos efectivos de cada rol (fase 13, D169): los que eligió el dueño (tabla `permisos_rol`) o, si
 * no eligió nada, los de fábrica de `packages/shared`. Se guardan en memoria para que cada petición los
 * consulte sin ir a la base; se recargan al arrancar y cada vez que alguien los cambia.
 * Una instalación corre un solo proceso de la API (§4.4), así que la memoria no se desincroniza.
 */
const configurados = new Map<Rol, readonly Permiso[]>();

export function permisosDeRol(rol: Rol): readonly Permiso[] {
  return configurados.get(rol) ?? permisosDeFabrica(rol);
}

export function tienePermiso(rol: Rol, permiso: Permiso): boolean {
  return permisosDeRol(rol).includes(permiso);
}

export function esConfiguradoPorElDueno(rol: Rol): boolean {
  return configurados.has(rol);
}

export async function cargarPermisos(prisma: Pick<PrismaClient, 'permisosRol'>): Promise<void> {
  const filas = await prisma.permisosRol.findMany();
  configurados.clear();
  for (const fila of filas) {
    // En el orden del catálogo, e ignorando cualquier permiso que ya no exista.
    configurados.set(
      fila.rol,
      PERMISOS.filter((p) => fila.permisos.includes(p)),
    );
  }
}

/**
 * Restricciones que ningún rol puede saltarse (§6.1, D170). Devuelve los problemas en español; vacío si
 * el conjunto es válido.
 */
export function problemasDePermisos(rol: Rol, permisos: readonly string[]): string[] {
  const problemas: string[] = [];
  const desconocidos = permisos.filter((p) => !esPermiso(p));
  if (desconocidos.length > 0) problemas.push(`No existen: ${desconocidos.join(', ')}.`);
  if (rol !== 'administrador') {
    for (const p of PERMISOS_SOLO_ADMINISTRADOR) {
      if (permisos.includes(p)) problemas.push(`"${p}" es solo del administrador.`);
    }
  }
  for (const [a, b] of PERMISOS_INCOMPATIBLES) {
    if (permisos.includes(a) && permisos.includes(b)) {
      problemas.push(
        `"${a}" y "${b}" no pueden ir juntos: quien recibe el dinero no es quien lo paga.`,
      );
    }
  }
  if (rol === 'administrador') {
    for (const p of ['permiso.configurar', 'usuario.gestionar'] as const) {
      if (!permisos.includes(p)) {
        problemas.push(`El administrador no puede perder "${p}": nadie podría corregirlo después.`);
      }
    }
  }
  return problemas;
}
