import { describe, expect, it } from 'vitest';

import {
  avisoDecimalAmbiguo,
  decimalAmbiguo,
  formatearTasa,
  normalizarDecimal,
} from './formato.js';

describe('formatearTasa', () => {
  it('usa coma decimal y quita los ceros de relleno', () => {
    expect(formatearTasa('5.190000')).toBe('5,19');
    expect(formatearTasa('4.680000')).toBe('4,68');
  });

  it('conserva los decimales significativos, sin redondear', () => {
    expect(formatearTasa('4.685000')).toBe('4,685');
    expect(formatearTasa('0.000001')).toBe('0,000001');
  });

  it('rellena hasta el mínimo de decimales', () => {
    expect(formatearTasa('5.100000')).toBe('5,10');
    expect(formatearTasa('5')).toBe('5,00');
    expect(formatearTasa('0.000000')).toBe('0,00');
  });

  it('separa los miles con punto', () => {
    expect(formatearTasa('3200.000000')).toBe('3.200,00');
    expect(formatearTasa('1234567.500000')).toBe('1.234.567,50');
  });

  it('sin decimales mínimos, un entero queda sin coma (porcentajes)', () => {
    expect(formatearTasa('11.000000', 0)).toBe('11');
    expect(formatearTasa('11.500000', 0)).toBe('11,5');
  });
});

describe('normalizarDecimal', () => {
  it('acepta coma o punto como decimal', () => {
    expect(normalizarDecimal('4,68')).toBe('4.68');
    expect(normalizarDecimal('4.68')).toBe('4.68');
    expect(normalizarDecimal(' 11 ')).toBe('11');
  });

  it('con coma decimal, los puntos son de miles y se quitan', () => {
    expect(normalizarDecimal('3.200,50')).toBe('3200.50');
    expect(normalizarDecimal('1.234.567,5')).toBe('1234567.5');
  });

  it('no inventa un numero: lo que no lo es llega tal cual a la API', () => {
    expect(normalizarDecimal('abc')).toBe('abc');
    expect(normalizarDecimal('')).toBe('');
  });
});

describe('decimalAmbiguo', () => {
  it('detecta lo que parece punto de miles sin coma decimal', () => {
    expect(decimalAmbiguo('3.200')).toBe(true);
    expect(decimalAmbiguo('1.234.567')).toBe(true);
    expect(decimalAmbiguo('4.680')).toBe(true);
  });

  it('lo que solo se puede leer de una manera no es ambiguo', () => {
    expect(decimalAmbiguo('4.68')).toBe(false);
    expect(decimalAmbiguo('3200')).toBe(false);
    expect(decimalAmbiguo('3,2')).toBe(false);
    expect(decimalAmbiguo('3.200,50')).toBe(false);
    expect(decimalAmbiguo('5.1948')).toBe(false);
    expect(decimalAmbiguo('')).toBe(false);
  });

  it('el aviso propone las dos formas de escribirlo bien', () => {
    expect(avisoDecimalAmbiguo('3.200')).toBe(
      'No queda claro si es 3200 o 3,200. Escribe 3200 (sin punto de miles) o 3,200 (con coma decimal).',
    );
    expect(avisoDecimalAmbiguo('4.68')).toBeNull();
  });
});
