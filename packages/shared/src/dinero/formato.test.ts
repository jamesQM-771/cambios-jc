import { describe, expect, it } from 'vitest';

import { formatearMoneda } from './formato.js';

describe('formatearMoneda', () => {
  it('formatos de CLAUDE.md', () => {
    expect(formatearMoneda('162000', 'COP')).toBe('COP 162.000');
    expect(formatearMoneda('43085.106', 'VES')).toBe('VES 43.085,106');
    expect(formatearMoneda('150', 'USD')).toBe('USD 150,00');
  });

  it('COP se muestra sin decimales, redondeando HALF_UP (D21)', () => {
    expect(formatearMoneda('162000.50', 'COP')).toBe('COP 162.001');
    expect(formatearMoneda('162000.49', 'COP')).toBe('COP 162.000');
  });

  it('VES muestra 3 decimales truncados', () => {
    expect(formatearMoneda('13244.6808', 'VES')).toBe('VES 13.244,680');
  });

  it('cero', () => {
    expect(formatearMoneda('0', 'COP')).toBe('COP 0');
    expect(formatearMoneda('0', 'VES')).toBe('VES 0,000');
    expect(formatearMoneda('-0.0001', 'VES')).toBe('VES 0,000');
  });

  it('negativos con el signo antes de la moneda (D22)', () => {
    expect(formatearMoneda('-1000', 'COP')).toBe('-COP 1.000');
    expect(formatearMoneda('-85000.5', 'USD')).toBe('-USD 85.000,50');
  });

  it('montos grandes', () => {
    expect(formatearMoneda('999999999999.99', 'USD')).toBe('USD 999.999.999.999,99');
    expect(formatearMoneda('1000000', 'COP')).toBe('COP 1.000.000');
    expect(formatearMoneda('999', 'COP')).toBe('COP 999');
  });
});
