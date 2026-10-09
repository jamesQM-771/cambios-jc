import { describe, expect, it } from 'vitest';

import { ErrorDinero } from '../dinero/errores.js';

import { tasaDesdeMargenPorcentaje } from './calcular.js';

const texto = (valor: ReturnType<typeof tasaDesdeMargenPorcentaje>) => valor.toFixed(2);

describe('tasaDesdeMargenPorcentaje (proveedor + margen %, fijado a 2 decimales)', () => {
  it('caso real: proveedor 4,68 + margen 11 % = 5,19', () => {
    expect(texto(tasaDesdeMargenPorcentaje('4.68', '11'))).toBe('5.19');
  });

  it('redondea con ROUND_HALF_UP, no trunca', () => {
    // 4.68 * 1.11 = 5.1948 -> 5.19 (el tercer decimal, 4, redondea hacia abajo).
    expect(texto(tasaDesdeMargenPorcentaje('4.68', '11'))).toBe('5.19');
    // Un caso que sí sube: 1 * 1.005 = 1.005 -> 1.01 (HALF_UP).
    expect(texto(tasaDesdeMargenPorcentaje('1', '0.5'))).toBe('1.01');
  });

  it('margen cero deja la tasa igual a la referencia', () => {
    expect(texto(tasaDesdeMargenPorcentaje('3.76', '0'))).toBe('3.76');
  });

  it('acepta Decimal además de texto', () => {
    const referencia = tasaDesdeMargenPorcentaje('1', '0'); // Decimal: 1.00
    expect(texto(tasaDesdeMargenPorcentaje(referencia, '10'))).toBe('1.10');
  });

  it('rechaza una tasa de referencia cero o negativa', () => {
    expect(() => tasaDesdeMargenPorcentaje('0', '11')).toThrow(ErrorDinero);
    expect(() => tasaDesdeMargenPorcentaje('-1', '11')).toThrow(ErrorDinero);
  });

  it('rechaza un margen negativo', () => {
    expect(() => tasaDesdeMargenPorcentaje('4.68', '-1')).toThrow(ErrorDinero);
  });
});
