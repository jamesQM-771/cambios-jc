import { describe, expect, it } from 'vitest';

import {
  efectoDeMovimiento,
  sentidoEnCuenta,
  TIPOS_MOVIMIENTO_CONTRAPARTE,
} from './movimientos.js';

describe('efectoDeMovimiento (tabla §5.8)', () => {
  it('cada tipo tiene el efecto de la especificación', () => {
    expect(efectoDeMovimiento('prestamo_otorgado').signo).toBe(1);
    expect(efectoDeMovimiento('prestamo_recibido').signo).toBe(-1);
    expect(efectoDeMovimiento('abono_recibido').signo).toBe(-1);
    expect(efectoDeMovimiento('abono_entregado').signo).toBe(1);
    expect(efectoDeMovimiento('anticipo_proveedor').signo).toBe(1);
    expect(efectoDeMovimiento('compra_credito').signo).toBe(-1);
    expect(efectoDeMovimiento('ajuste').signo).toBeNull();
    expect(efectoDeMovimiento('otro').signo).toBeNull();
  });

  it('el ajuste nunca mueve dinero y la compra a crédito solo la registra el sistema', () => {
    expect(efectoDeMovimiento('ajuste').admiteCuenta).toBe(false);
    expect(efectoDeMovimiento('compra_credito').soloSistema).toBe(true);
    expect(efectoDeMovimiento('anticipo_proveedor').exigeCuenta).toBe(true);
  });

  it('todos los tipos están definidos', () => {
    for (const tipo of TIPOS_MOVIMIENTO_CONTRAPARTE) expect(efectoDeMovimiento(tipo)).toBeDefined();
  });
});

describe('sentidoEnCuenta', () => {
  it('si me debe más, salió plata; si me debe menos, entró', () => {
    expect(sentidoEnCuenta(1)).toBe('salida');
    expect(sentidoEnCuenta(-1)).toBe('entrada');
  });
});
