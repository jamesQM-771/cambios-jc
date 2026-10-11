import { describe, expect, it } from 'vitest';

import { formatearTasa } from './formato.js';

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
