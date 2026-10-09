import { permisosDeRol, ROLES } from '@cambios-jc/shared';
import { describe, expect, it } from 'vitest';

import { ENTRADAS_MENU, entradasVisibles } from './menu.js';

const etiquetasDe = (rol: (typeof ROLES)[number]) =>
  entradasVisibles(permisosDeRol(rol)).map((entrada) => entrada.etiqueta);

describe('menú según permisos', () => {
  it('el administrador ve todo', () => {
    expect(etiquetasDe('administrador')).toEqual([
      'Inicio',
      'Usuarios',
      'Empresa',
      'Configuración',
      'Bitácora',
    ]);
  });

  it('el vendedor y el digitador solo ven Inicio por ahora', () => {
    expect(etiquetasDe('vendedor')).toEqual(['Inicio']);
    expect(etiquetasDe('digitador')).toEqual(['Inicio']);
  });

  it('sin permisos solo queda Inicio', () => {
    expect(entradasVisibles([]).map((entrada) => entrada.etiqueta)).toEqual(['Inicio']);
  });

  it('Inicio es la única entrada que no pide permiso', () => {
    const sinPermiso = ENTRADAS_MENU.filter((entrada) => !entrada.permiso).map(
      (entrada) => entrada.ruta,
    );
    expect(sinPermiso).toEqual(['/']);
  });
});
