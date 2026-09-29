import { describe, expect, it } from 'vitest';

import { enmascararCuenta } from './enmascarar.js';
import { ErrorDinero } from './errores.js';

describe('enmascararCuenta', () => {
  it('deja visibles el código del banco y los últimos 4 dígitos', () => {
    expect(enmascararCuenta('01020000000000004441')).toBe('0102 **** **** **** 4441');
  });

  it('acepta la cuenta con espacios', () => {
    expect(enmascararCuenta('0102 0000 0000 0000 4441')).toBe('0102 **** **** **** 4441');
  });

  it.each([
    ['19 dígitos', '0102000000000000444'],
    ['21 dígitos', '010200000000000044411'],
    ['letras', '0102000000000000444A'],
    ['vacía', ''],
  ])('rechaza una cuenta con %s', (_caso, cuenta) => {
    expect(() => enmascararCuenta(cuenta)).toThrow(
      expect.objectContaining({ codigo: 'CUENTA_INVALIDA' }) as ErrorDinero,
    );
  });
});
