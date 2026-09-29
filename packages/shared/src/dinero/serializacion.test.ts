import { Decimal as DecimalJs } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { Decimal } from './decimal.js';
import { ErrorDinero } from './errores.js';
import { aDecimal, aTexto, leerDecimal } from './serializacion.js';

describe('leerDecimal', () => {
  it.each(['162000', '162000.00', '3.76', '-1200.5', '0', '007'])('acepta "%s"', (valor) => {
    expect(leerDecimal(valor).eq(new Decimal(valor))).toBe(true);
  });

  it.each([
    ['número de JavaScript', 162000],
    ['coma decimal', '1,5'],
    ['separador de miles', '162.000,00'],
    ['texto', 'abc'],
    ['vacío', ''],
    ['espacios', ' 10'],
    ['notación científica', '1e5'],
    ['nulo', null],
    ['infinito', 'Infinity'],
  ])('rechaza %s', (_caso, valor) => {
    expect(() => leerDecimal(valor)).toThrow(
      expect.objectContaining({ codigo: 'VALOR_INVALIDO' }) as ErrorDinero,
    );
  });

  it('"-0" se lee como cero positivo', () => {
    expect(leerDecimal('-0').isNegative()).toBe(false);
  });
});

describe('aTexto', () => {
  it('nunca usa notación científica', () => {
    expect(aTexto('1000000000000000000000')).toBe('1000000000000000000000');
    expect(aTexto('0.0000001')).toBe('0.0000001');
  });

  it('ida y vuelta texto → Decimal → texto', () => {
    for (const valor of ['43085.106', '999999999999.99', '0.000001', '-1200.5']) {
      expect(aTexto(leerDecimal(valor))).toBe(valor);
    }
  });
});

describe('aDecimal', () => {
  it('acepta Decimal de otra copia de decimal.js (como el de Prisma)', () => {
    expect(aDecimal(new DecimalJs('3.76')).toFixed()).toBe('3.76');
  });
});
