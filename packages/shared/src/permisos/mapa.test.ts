import { describe, expect, it } from 'vitest';

import { permisosDeRol, tienePermiso } from './mapa.js';
import { PERMISOS, type Permiso } from './permisos.js';
import { PERMISOS_INCOMPATIBLES, PERMISOS_SOLO_ADMINISTRADOR } from './restricciones.js';
import { ROLES, type Rol } from './roles.js';

// Matriz escrita a mano desde PROYECTO.md §6.2 (con D28 y D29). No se calcula a partir del
// mapa: si alguien cambia el mapa por error, esta prueba debe fallar.
// Orden de las columnas: administrador, vendedor, digitador.
const MATRIZ: Record<Permiso, readonly [boolean, boolean, boolean]> = {
  'usuario.gestionar': [true, false, false],
  'auditoria.ver': [true, false, false],
  'empresa.configurar': [true, false, false],
  'margen.configurar': [true, false, false],
  'permiso.configurar': [true, false, false],
  'turno.gestionar_propio': [true, true, false],
  'caja.reabrir': [true, false, false],
  'jornada.cerrar': [true, false, false],
  'gasto.registrar': [true, true, false],
  'gasto.gestionar': [true, false, false],
  'traslado.registrar': [true, true, false],
  'traslado.gestionar': [true, false, false],
  'cliente.registrar': [true, true, false],
  'remesa.registrar': [true, true, false],
  'remesa.verificar_pago': [true, true, false],
  'remesa.anular': [true, false, false],
  'remesa.liberar': [true, false, false],
  'remesa.tomar_completar': [false, false, true],
  'tasa.publicar': [true, false, false],
  'tasa.cambiar_en_operacion': [true, false, false],
  'divisa_caja.operar': [true, true, false],
  'compra_contraparte.registrar': [true, false, false],
  'contraparte.registrar_movimiento': [true, false, false],
  'aprobacion.aprobar': [true, false, false],
  'cumplimiento.gestionar_alertas': [true, false, false],
};

describe('mapa de permisos por rol', () => {
  it('la matriz cubre todos los permisos del catálogo', () => {
    expect(Object.keys(MATRIZ).sort()).toEqual([...PERMISOS].sort());
  });

  it.each(PERMISOS)('%s', (permiso) => {
    const esperado = MATRIZ[permiso];
    ROLES.forEach((rol, indice) => {
      expect(tienePermiso(rol, permiso), `${rol} · ${permiso}`).toBe(esperado[indice]);
    });
  });

  it('el digitador solo puede tomar y completar remesas', () => {
    expect(permisosDeRol('digitador')).toEqual(['remesa.tomar_completar']);
  });

  it('el vendedor no gestiona usuarios, tasas, contrapartes ni configuración', () => {
    for (const permiso of [
      'usuario.gestionar',
      'auditoria.ver',
      'empresa.configurar',
      'tasa.publicar',
      'tasa.cambiar_en_operacion',
      'contraparte.registrar_movimiento',
      'aprobacion.aprobar',
      'jornada.cerrar',
    ] as const) {
      expect(tienePermiso('vendedor', permiso), permiso).toBe(false);
    }
  });

  it('el administrador tiene todo menos pagar remesas', () => {
    const faltantes = PERMISOS.filter((permiso) => !tienePermiso('administrador', permiso));
    expect(faltantes).toEqual(['remesa.tomar_completar']);
  });

  it('todo permiso lo tiene al menos un rol', () => {
    for (const permiso of PERMISOS) {
      expect(
        ROLES.some((rol) => tienePermiso(rol, permiso)),
        permiso,
      ).toBe(true);
    }
  });

  it('el catálogo y las listas de cada rol no tienen duplicados', () => {
    expect(new Set(PERMISOS).size).toBe(PERMISOS.length);
    for (const rol of ROLES) {
      expect(new Set(permisosDeRol(rol)).size, rol).toBe(permisosDeRol(rol).length);
    }
  });

  it('los permisos siguen el formato recurso.accion en minúsculas', () => {
    for (const permiso of PERMISOS) expect(permiso).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });
});

describe('restricciones fijas', () => {
  it('solo el administrador tiene los permisos exclusivos (reabrir cierres)', () => {
    expect(PERMISOS_SOLO_ADMINISTRADOR).toContain('caja.reabrir');
    for (const permiso of PERMISOS_SOLO_ADMINISTRADOR) {
      for (const rol of ROLES.filter((r): r is Rol => r !== 'administrador')) {
        expect(tienePermiso(rol, permiso), `${rol} · ${permiso}`).toBe(false);
      }
    }
  });

  it('ningún rol tiene a la vez dos permisos incompatibles (quien recibe no es quien paga)', () => {
    expect(PERMISOS_INCOMPATIBLES).toContainEqual(['remesa.registrar', 'remesa.tomar_completar']);
    for (const rol of ROLES) {
      for (const [a, b] of PERMISOS_INCOMPATIBLES) {
        expect(tienePermiso(rol, a) && tienePermiso(rol, b), `${rol} · ${a} + ${b}`).toBe(false);
      }
    }
  });
});
