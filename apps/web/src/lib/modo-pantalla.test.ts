import { describe, expect, it, vi } from 'vitest';

import { CONSULTA_CELULAR, CONSULTA_TABLETA, modoPantallaActual } from './modo-pantalla.js';

const anchoQueCumple = (...consultas: string[]) =>
  vi
    .spyOn(window, 'matchMedia')
    .mockImplementation(
      (consulta) => ({ matches: consultas.includes(consulta), media: consulta }) as MediaQueryList,
    );

describe('modo de pantalla', () => {
  it('celular gana sobre tableta (un celular también cumple el ancho de tableta)', () => {
    anchoQueCumple(CONSULTA_CELULAR, CONSULTA_TABLETA);
    expect(modoPantallaActual()).toBe('celular');
  });

  it('tableta entre 801 y 1100 px', () => {
    anchoQueCumple(CONSULTA_TABLETA);
    expect(modoPantallaActual()).toBe('tableta');
  });

  it('escritorio cuando no cumple ninguna', () => {
    anchoQueCumple();
    expect(modoPantallaActual()).toBe('escritorio');
  });
});
