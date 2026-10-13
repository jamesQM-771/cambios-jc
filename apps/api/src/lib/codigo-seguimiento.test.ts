import { describe, expect, it } from 'vitest';

import { generarCodigoSeguimiento, normalizarCodigoSeguimiento } from './codigo-seguimiento.js';

describe('generarCodigoSeguimiento', () => {
  it('son 12 símbolos del alfabeto sin letras que se confunden', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generarCodigoSeguimiento()).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    }
  });

  it('no se repite (2.000 códigos distintos)', () => {
    const codigos = new Set(Array.from({ length: 2000 }, () => generarCodigoSeguimiento()));

    expect(codigos.size).toBe(2000);
  });

  it('usa todo el alfabeto de forma pareja, sin sesgo grosero', () => {
    const conteo = new Map<string, number>();
    for (let i = 0; i < 4000; i += 1) {
      for (const simbolo of generarCodigoSeguimiento()) {
        conteo.set(simbolo, (conteo.get(simbolo) ?? 0) + 1);
      }
    }

    expect(conteo.size).toBe(32);
    // Esperado: 4000 × 12 ÷ 32 = 1500 por símbolo.
    for (const veces of conteo.values()) {
      expect(veces).toBeGreaterThan(1250);
      expect(veces).toBeLessThan(1750);
    }
  });
});

describe('normalizarCodigoSeguimiento', () => {
  it('acepta minúsculas, espacios y guiones', () => {
    expect(normalizarCodigoSeguimiento('abcd-efgh jkmn')).toBe('ABCDEFGHJKMN');
    expect(normalizarCodigoSeguimiento(' 0123456789AB ')).toBe('0123456789AB');
  });

  it.each(['', 'ABC', 'ABCDEFGHJKMNP', 'ABCDEFGHIJKL', 'ABCDEFGHJKM!', 'ABCDEFGHJKMU'])(
    'rechaza %j',
    (texto) => {
      expect(normalizarCodigoSeguimiento(texto)).toBeNull();
    },
  );
});
