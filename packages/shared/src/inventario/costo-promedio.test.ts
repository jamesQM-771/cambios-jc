import { describe, expect, it } from 'vitest';

import { Decimal } from '../dinero/decimal.js';
import { ErrorDinero } from '../dinero/errores.js';

import {
  entrarAlInventario,
  fijarCosto,
  gananciaDeRemesa,
  gananciaDeVentaDivisa,
  totalDeDenominaciones,
  revertirEntrada,
  salirDelInventario,
  type EstadoInventario,
} from './costo-promedio.js';

const vacio: EstadoInventario = { cantidad: new Decimal(0), costoPromedio: null };
const estado = (cantidad: string, costo: string | null): EstadoInventario => ({
  cantidad: new Decimal(cantidad),
  costoPromedio: costo === null ? null : new Decimal(costo),
});
const ver = (e: EstadoInventario) => ({
  cantidad: e.cantidad.toFixed(3),
  costo: e.costoPromedio?.toFixed(6) ?? null,
});

describe('entrarAlInventario (costo promedio ponderado móvil, §7.3)', () => {
  it('la primera compra fija el costo en su tasa', () => {
    expect(ver(entrarAlInventario(vacio, '1000', '3.70', 'VES'))).toEqual({
      cantidad: '1000.000',
      costo: '3.700000',
    });
  });

  it('pondera por cantidad, no promedia tasas (el error del Excel)', () => {
    // 1000 a 3,70 + 3000 a 3,80 = (3700 + 11400) / 4000 = 3,775. El AVERAGEIF del Excel daría 3,75.
    const primera = entrarAlInventario(vacio, '1000', '3.70', 'VES');
    expect(ver(entrarAlInventario(primera, '3000', '3.80', 'VES'))).toEqual({
      cantidad: '4000.000',
      costo: '3.775000',
    });
  });

  it('redondea el costo a 6 decimales con ROUND_HALF_UP', () => {
    // (1 × 3 + 2 × 4) / 3 = 3,666666… → 3,666667
    const e = entrarAlInventario(estado('1', '3'), '2', '4', 'VES');
    expect(e.costoPromedio?.toFixed(6)).toBe('3.666667');
  });

  it('con inventario negativo, el costo pasa a ser el de la compra', () => {
    expect(ver(entrarAlInventario(estado('-500', '3.70'), '2000', '3.90', 'VES'))).toEqual({
      cantidad: '1500.000',
      costo: '3.900000',
    });
  });

  it('con inventario en cero conserva la cantidad y toma la tasa nueva', () => {
    expect(ver(entrarAlInventario(estado('0', '3.50'), '10', '3.60', 'VES'))).toEqual({
      cantidad: '10.000',
      costo: '3.600000',
    });
  });

  it('montos grandes y muchos decimales sin perder precisión', () => {
    const e = entrarAlInventario(
      estado('987654321.123', '3.761234'),
      '123456789.987',
      '3.812345',
      'VES',
    );
    // (987654321.123 × 3.761234 + 123456789.987 × 3.812345) / 1111111111.11
    const esperado = new Decimal('987654321.123')
      .times('3.761234')
      .plus(new Decimal('123456789.987').times('3.812345'))
      .dividedBy('1111111111.11');
    expect(e.cantidad.toFixed(3)).toBe('1111111111.110');
    expect(e.costoPromedio?.toFixed(6)).toBe(esperado.toDecimalPlaces(6).toFixed(6));
  });

  it('rechaza cantidad o tasa en cero o negativas', () => {
    expect(() => entrarAlInventario(vacio, '0', '3.7', 'VES')).toThrow(ErrorDinero);
    expect(() => entrarAlInventario(vacio, '10', '0', 'VES')).toThrow(ErrorDinero);
    expect(() => entrarAlInventario(vacio, '-1', '3.7', 'VES')).toThrow(ErrorDinero);
  });
});

describe('salirDelInventario', () => {
  it('sale al costo promedio vigente y no lo cambia', () => {
    const { estado: e, costoUnitario } = salirDelInventario(estado('4000', '3.775'), '1500', 'VES');
    expect(costoUnitario?.toFixed(6)).toBe('3.775000');
    expect(ver(e)).toEqual({ cantidad: '2500.000', costo: '3.775000' });
  });

  it('puede dejar el inventario negativo', () => {
    expect(ver(salirDelInventario(estado('100', '3.7'), '150.5', 'VES').estado)).toEqual({
      cantidad: '-50.500',
      costo: '3.700000',
    });
  });

  it('sin costo conocido devuelve costo nulo', () => {
    expect(salirDelInventario(vacio, '10', 'VES').costoUnitario).toBeNull();
  });
});

describe('revertirEntrada (anular una compra)', () => {
  it('vuelve al costo anterior si nada se vendió', () => {
    const antes = entrarAlInventario(vacio, '1000', '3.70', 'VES');
    const despues = entrarAlInventario(antes, '3000', '3.80', 'VES');
    expect(ver(revertirEntrada(despues, '3000', '3.80', 'VES'))).toEqual(ver(antes));
  });

  it('si ya no queda inventario, baja la cantidad y conserva el costo', () => {
    expect(ver(revertirEntrada(estado('500', '3.80'), '3000', '3.80', 'VES'))).toEqual({
      cantidad: '-2500.000',
      costo: '3.800000',
    });
  });

  it('si el resultado no tiene sentido (costo ≤ 0), conserva el costo', () => {
    // 100 × 1 − 50 × 5 < 0
    expect(ver(revertirEntrada(estado('100', '1'), '50', '5', 'VES'))).toEqual({
      cantidad: '50.000',
      costo: '1.000000',
    });
  });
});

describe('gananciaDeRemesa (§7.3)', () => {
  it('caso real: 43.085,106 Bs a 3,76 comprados a 3,70', () => {
    const g = gananciaDeRemesa({
      montoBolivares: '43085.106',
      tasaUsada: '3.76',
      costoPromedio: '3.70',
      costoBancario: null,
    });
    // (3,76 − 3,70) × 43085,106 = 2585,10636 → 2585,11
    expect(g.bruta.toFixed(2)).toBe('2585.11');
    expect(g.costoBancarioPesos.toFixed(2)).toBe('0.00');
    expect(g.neta.toFixed(2)).toBe('2585.11');
  });

  it('resta el costo bancario llevado a pesos al costo promedio', () => {
    const g = gananciaDeRemesa({
      montoBolivares: '43085.106',
      tasaUsada: '3.76',
      costoPromedio: '3.70',
      costoBancario: '12.5',
    });
    // 12,5 × 3,70 = 46,25
    expect(g.costoBancarioPesos.toFixed(2)).toBe('46.25');
    expect(g.neta.toFixed(2)).toBe('2538.86');
  });

  it('puede ser negativa si se vendió por debajo del costo', () => {
    const g = gananciaDeRemesa({
      montoBolivares: '1000',
      tasaUsada: '3.60',
      costoPromedio: '3.70',
      costoBancario: '0',
    });
    expect(g.neta.toFixed(2)).toBe('-100.00');
  });

  it('redondea medio peso hacia arriba', () => {
    // (3,775 − 3,77) × 1 = 0,005 → 0,01
    const g = gananciaDeRemesa({
      montoBolivares: '1',
      tasaUsada: '3.775',
      costoPromedio: '3.77',
      costoBancario: null,
    });
    expect(g.bruta.toFixed(2)).toBe('0.01');
  });

  it('cero bolívares da cero', () => {
    const g = gananciaDeRemesa({
      montoBolivares: '0',
      tasaUsada: '3.76',
      costoPromedio: '3.70',
      costoBancario: null,
    });
    expect(g.neta.toFixed(2)).toBe('0.00');
  });
});

describe('fijarCosto', () => {
  it('6 decimales con ROUND_HALF_UP', () => {
    expect(fijarCosto('3.7777775').toFixed(6)).toBe('3.777778');
    expect(fijarCosto('3.7777774').toFixed(6)).toBe('3.777777');
  });
});

describe('gananciaDeVentaDivisa', () => {
  it('(venta − costo) × dólares, en pesos', () => {
    expect(
      gananciaDeVentaDivisa({
        montoDivisa: '150',
        tasaUsada: '4100',
        costoPromedio: '3950.5',
      }).toFixed(2),
    ).toBe('22425.00');
  });

  it('redondea medio peso hacia arriba y puede ser negativa', () => {
    expect(
      gananciaDeVentaDivisa({
        montoDivisa: '0.01',
        tasaUsada: '4000.5',
        costoPromedio: '4000',
      }).toFixed(2),
    ).toBe('0.01');
    expect(
      gananciaDeVentaDivisa({
        montoDivisa: '100',
        tasaUsada: '3900',
        costoPromedio: '4000',
      }).toFixed(2),
    ).toBe('-10000.00');
  });
});

describe('totalDeDenominaciones', () => {
  it('suma valor × cantidad; vacío es cero', () => {
    expect(
      totalDeDenominaciones([
        { valor: '100', cantidad: 2 },
        { valor: '20', cantidad: 3 },
        { valor: '0.25', cantidad: 4 },
      ]).toFixed(2),
    ).toBe('261.00');
    expect(totalDeDenominaciones([]).toFixed(2)).toBe('0.00');
  });
});
