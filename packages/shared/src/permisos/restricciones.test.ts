import { describe, expect, it } from 'vitest';

import { esPermiso, PERMISOS } from './permisos.js';
import { comprobarAprobacion } from './restricciones.js';
import { esRol, ROLES } from './roles.js';

describe('comprobarAprobacion (nadie aprueba lo propio)', () => {
  it('rechaza que la misma persona apruebe su propia solicitud, aunque tenga el permiso', () => {
    expect(comprobarAprobacion('usuario-1', 'usuario-1', true)).toEqual({
      permitido: false,
      motivo: 'APROBAR_LO_PROPIO',
    });
  });

  it('rechaza a otra persona que no tiene el permiso de aprobar', () => {
    expect(comprobarAprobacion('usuario-1', 'usuario-2', false)).toEqual({
      permitido: false,
      motivo: 'SIN_PERMISO',
    });
  });

  it('permite que otra persona con el permiso apruebe', () => {
    expect(comprobarAprobacion('usuario-1', 'usuario-2', true)).toEqual({ permitido: true });
  });

  it('aprobar lo propio se rechaza primero, incluso sin permiso', () => {
    expect(comprobarAprobacion('usuario-1', 'usuario-1', false)).toEqual({
      permitido: false,
      motivo: 'APROBAR_LO_PROPIO',
    });
  });
});

describe('roles', () => {
  it('son exactamente tres (D28)', () => {
    expect([...ROLES]).toEqual(['administrador', 'vendedor', 'digitador']);
  });

  it('esRol acepta los roles y rechaza cualquier otra cosa', () => {
    for (const rol of ROLES) expect(esRol(rol)).toBe(true);
    for (const valor of ['supervisor', 'cumplimiento', 'Administrador', '', null, undefined, 1]) {
      expect(esRol(valor), String(valor)).toBe(false);
    }
  });
});

describe('esPermiso', () => {
  it('acepta los permisos del catálogo y rechaza los demás', () => {
    for (const permiso of PERMISOS) expect(esPermiso(permiso)).toBe(true);
    for (const valor of ['remesa.borrar', 'usuario', '', null, 5]) {
      expect(esPermiso(valor), String(valor)).toBe(false);
    }
  });
});
