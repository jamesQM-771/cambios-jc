import { describe, expect, it } from 'vitest';

import { Decimal } from './decimal.js';
import { ErrorDinero } from './errores.js';
import { comparar, dividir, multiplicar, restar, sumar } from './operaciones.js';

describe('operaciones', () => {
  it('suma sin errores de coma flotante: 0,1 + 0,2 = 0,3', () => {
    expect(sumar('0.1', '0.2').toFixed()).toBe('0.3');
  });

  it('resta y multiplica con precisión', () => {
    expect(restar('162000.00', '0.01').toFixed()).toBe('161999.99');
    expect(multiplicar('43085.106', '3.76').toFixed()).toBe('161999.99856');
  });

  it('no redondea en pasos intermedios', () => {
    const tercio = dividir('1', '3');
    expect(multiplicar(tercio, '3').toFixed()).not.toBe('1.00');
    expect(tercio.toFixed(20)).toBe('0.33333333333333333333');
  });

  it('dividir entre cero lanza DIVISION_POR_CERO', () => {
    expect(() => dividir('1', '0')).toThrow(
      expect.objectContaining({ codigo: 'DIVISION_POR_CERO' }) as ErrorDinero,
    );
  });

  it('opera con montos grandes', () => {
    expect(sumar('999999999999.99', '0.01').toFixed()).toBe('1000000000000');
  });

  it('compara valores', () => {
    expect(comparar('1.0', '1')).toBe(0);
    expect(comparar('0.999', '1')).toBe(-1);
    expect(comparar(new Decimal('2'), '1')).toBe(1);
  });
});
