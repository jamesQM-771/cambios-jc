import { describe, expect, it } from 'vitest';

import { bolivaresDesdePesos, pesosDesdeDivisa } from './conversion.js';
import { Decimal } from './decimal.js';
import { ErrorDinero } from './errores.js';

const texto = (valor: Decimal) => valor.toFixed(3);

describe('bolivaresDesdePesos (pesos ÷ tasa, truncado a 3 decimales)', () => {
  it.each([
    // Casos reales de la exportación del programa actual (que los truncaba a enteros).
    ['162000', '3.76', '43085.106'],
    ['150000', '3.76', '39893.617'],
    ['49800', '3.76', '13244.680'],
    ['85800', '3.76', '22819.148'],
    ['500000', '3.78', '132275.132'],
  ])('%s ÷ %s = %s', (pesos, tasa, esperado) => {
    expect(texto(bolivaresDesdePesos(pesos, tasa))).toBe(esperado);
  });

  it('trunca, no redondea: 0,0009999 → 0,000 y 2 ÷ 3 = 0,666', () => {
    expect(texto(bolivaresDesdePesos('0.0009999', '1'))).toBe('0.000');
    expect(texto(bolivaresDesdePesos('2', '3'))).toBe('0.666');
  });

  it('cero pesos da cero bolívares', () => {
    expect(texto(bolivaresDesdePesos('0', '3.76'))).toBe('0.000');
  });

  it('acepta tasas con 6 decimales', () => {
    expect(texto(bolivaresDesdePesos('1000000', '3.765432'))).toBe('265573.777');
  });

  it('montos de 12 dígitos no pierden precisión', () => {
    expect(bolivaresDesdePesos('999999999999.99', '3.76').toFixed(3)).toBe('265957446808.507');
  });

  it('un cociente con muchos nueves no se redondea hacia arriba antes de truncar', () => {
    // 0,9999999… con más de 40 dígitos: un redondeo interno daría 1,000.
    expect(texto(bolivaresDesdePesos('0.99999999999999999999999999999999999999999999', '1'))).toBe(
      '0.999',
    );
  });

  it('acepta Decimal además de texto', () => {
    expect(texto(bolivaresDesdePesos(new Decimal('162000'), new Decimal('3.76')))).toBe(
      '43085.106',
    );
  });

  it.each([['0'], ['-3.76']])('rechaza la tasa %s', (tasa) => {
    expect(() => bolivaresDesdePesos('1000', tasa)).toThrow(
      expect.objectContaining({ codigo: 'TASA_INVALIDA' }) as ErrorDinero,
    );
  });

  it('rechaza pesos negativos', () => {
    expect(() => bolivaresDesdePesos('-1', '3.76')).toThrow(
      expect.objectContaining({ codigo: 'MONTO_NEGATIVO' }) as ErrorDinero,
    );
  });
});

describe('pesosDesdeDivisa (divisa × tasa, 2 decimales ROUND_HALF_UP)', () => {
  it('150 USD a 3950 = 592.500,00 pesos', () => {
    expect(pesosDesdeDivisa('150', '3950').toFixed(2)).toBe('592500.00');
  });

  it('redondea a 2 decimales con HALF_UP', () => {
    expect(pesosDesdeDivisa('1.005', '1').toFixed(2)).toBe('1.01');
    expect(pesosDesdeDivisa('1.004', '1').toFixed(2)).toBe('1.00');
  });

  it('cero dólares da cero pesos', () => {
    expect(pesosDesdeDivisa('0', '3950').toFixed(2)).toBe('0.00');
  });

  it('rechaza tasa cero y montos negativos', () => {
    expect(() => pesosDesdeDivisa('10', '0')).toThrow(ErrorDinero);
    expect(() => pesosDesdeDivisa('-10', '3950')).toThrow(ErrorDinero);
  });
});
