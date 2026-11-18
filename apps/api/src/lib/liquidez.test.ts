import { describe, expect, it } from 'vitest';

import { alcanzaPara, cercaDelLimite } from './liquidez.js';

describe('reglas de liquidez', () => {
  it('alcanza si lo libre cubre la remesa, incluso exacto', () => {
    expect(alcanzaPara('1000.000', '999.999')).toBe(true);
    expect(alcanzaPara('1000.000', '1000')).toBe(true);
    expect(alcanzaPara('1000.000', '1000.001')).toBe(false);
    expect(alcanzaPara('-5', '1')).toBe(false);
  });

  it('cerca del límite desde el porcentaje configurado', () => {
    expect(cercaDelLimite('800', '1000', 80)).toBe(true);
    expect(cercaDelLimite('799.999', '1000', 80)).toBe(false);
    expect(cercaDelLimite('0', '1000', 1)).toBe(false);
  });
});
