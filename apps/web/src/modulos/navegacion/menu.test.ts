import { permisosDeRol, ROLES } from '@cambios-jc/shared';
import { describe, expect, it } from 'vitest';

import { ENTRADAS_MENU, entradasVisibles } from './menu.js';

const etiquetasDe = (rol: (typeof ROLES)[number]) =>
  entradasVisibles(permisosDeRol(rol)).map((entrada) => entrada.etiqueta);

describe('menú según permisos', () => {
  it('el administrador ve todo', () => {
    // El administrador no paga remesas (eso es del digitador), así que no ve la cola.
    expect(etiquetasDe('administrador')).toEqual([
      'Inicio',
      'Mi turno',
      'Remesas',
      'Traslados',
      'Clientes',
      'Usuarios',
      'Empresa',
      'Configuración',
      'Actividad',
    ]);
  });

  it('el vendedor vende y atiende clientes; el digitador solo paga', () => {
    expect(etiquetasDe('vendedor')).toEqual([
      'Inicio',
      'Mi turno',
      'Remesas',
      'Traslados',
      'Clientes',
    ]);
    expect(etiquetasDe('digitador')).toEqual(['Inicio', 'Cola de pagos']);
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
