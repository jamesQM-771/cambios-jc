import { describe, expect, it } from 'vitest';

import { leerSaldos, numeroDelExcel } from './migracion.js';

describe('numeroDelExcel', () => {
  it('acepta el formato colombiano y el de punto decimal', () => {
    expect(numeroDelExcel('1.250.000,50')).toBe('1250000.50');
    expect(numeroDelExcel('-350000')).toBe('-350000');
    expect(numeroDelExcel(' $ 1250000.5 ')).toBe('1250000.5');
    expect(numeroDelExcel('abc')).toBeNull();
    expect(numeroDelExcel('')).toBeNull();
  });
});

describe('leerSaldos', () => {
  it('invierte el signo del Excel (negativo = nos debe) y salta los saldos en cero', () => {
    const { filas, errores } = leerSaldos(
      'nombre;moneda;saldo\nPROVEEDOR A;COP;-1.250.000,50\nPROVEEDOR B;VES;3500,125\nSIN SALDO;COP;0\n',
    );
    expect(errores).toEqual([]);
    expect(filas).toEqual([
      {
        linea: 2,
        nombre: 'PROVEEDOR A',
        moneda: 'COP',
        saldoExcel: '-1250000.50',
        saldoSistema: '1250000.50',
      },
      {
        linea: 3,
        nombre: 'PROVEEDOR B',
        moneda: 'VES',
        saldoExcel: '3500.125',
        saldoSistema: '-3500.125',
      },
    ]);
  });

  it('reporta moneda, número, decimales y repetidos por línea', () => {
    const { errores } = leerSaldos(
      'nombre,moneda,saldo\nA b,EUR,10\nC d,COP,diez\nE f,COP,10.555\nG h,COP,5\ng  H,cop,6\n',
    );
    expect(errores.map((e) => e.linea)).toEqual([2, 3, 4, 6]);
  });
});
