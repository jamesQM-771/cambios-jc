import { describe, expect, it } from 'vitest';

import { fijarMonto, montoATexto } from './fijar.js';

describe('fijarMonto', () => {
  it('COP y USD redondean a 2 decimales con HALF_UP', () => {
    expect(montoATexto('0.005', 'COP')).toBe('0.01');
    expect(montoATexto('0.004', 'COP')).toBe('0.00');
    expect(montoATexto('10.125', 'USD')).toBe('10.13');
    expect(montoATexto('10.12499999', 'USD')).toBe('10.12');
  });

  it('HALF_UP en negativos se aleja del cero', () => {
    expect(montoATexto('-0.005', 'COP')).toBe('-0.01');
  });

  it('VES trunca al tercer decimal', () => {
    expect(montoATexto('43085.1063829', 'VES')).toBe('43085.106');
    expect(montoATexto('0.0009999', 'VES')).toBe('0.000');
    expect(montoATexto('13244.6808', 'VES')).toBe('13244.680');
  });

  it('nunca devuelve "-0"', () => {
    expect(montoATexto('-0.0001', 'VES')).toBe('0.000');
    expect(montoATexto('-0.001', 'COP')).toBe('0.00');
    expect(fijarMonto('-0.0001', 'VES').isNegative()).toBe(false);
  });

  it('montos de 18 dígitos se conservan', () => {
    expect(montoATexto('9999999999999999.99', 'COP')).toBe('9999999999999999.99');
  });
});
