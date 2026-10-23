import { describe, expect, it } from 'vitest';

import { cantidadDe, limpiarCantidad, subtotalDe, totalDe } from './conteo.js';

describe('limpiarCantidad', () => {
  it('deja solo dígitos y quita los ceros a la izquierda', () => {
    expect(limpiarCantidad('a5b')).toBe('5');
    expect(limpiarCantidad('007')).toBe('7');
    expect(limpiarCantidad('1.500')).toBe('1500');
    expect(limpiarCantidad('-3')).toBe('3');
  });

  it('sin dígitos queda vacío, y el cero se conserva', () => {
    expect(limpiarCantidad('')).toBe('');
    expect(limpiarCantidad('abc')).toBe('');
    expect(limpiarCantidad('0')).toBe('0');
    expect(limpiarCantidad('000')).toBe('0');
  });

  it('pone un tope a lo que se puede escribir', () => {
    expect(limpiarCantidad('123456789012')).toBe('1234567');
  });
});

describe('cantidadDe', () => {
  it('lo vacío o sin escribir es cero', () => {
    expect(cantidadDe(undefined)).toBe(0);
    expect(cantidadDe('')).toBe(0);
    expect(cantidadDe('12')).toBe(12);
  });
});

describe('subtotalDe y totalDe', () => {
  it('multiplican con decimales exactos y muestran los decimales de la moneda', () => {
    expect(subtotalDe('50001.000', 2, 'COP')).toBe('100002.00');
    expect(subtotalDe('87.000', 3, 'USD')).toBe('261.00');
    expect(subtotalDe('0.500', 3, 'VES')).toBe('1.500');
  });

  it('suman un conteo completo; sin nada contado el total es cero', () => {
    const lineas = [
      { valor: '50001.000', cantidad: 2 },
      { valor: '20001.000', cantidad: 3 },
    ];
    expect(totalDe(lineas, 'COP')).toBe('160005.00');
    expect(totalDe([], 'COP')).toBe('0.00');
    expect(totalDe([{ valor: '100000.000', cantidad: 0 }], 'COP')).toBe('0.00');
  });

  it('aguanta cantidades grandes sin perder precisión', () => {
    expect(totalDe([{ valor: '100000.000', cantidad: 1_000_000 }], 'COP')).toBe('100000000000.00');
  });
});
