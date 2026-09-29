import { Decimal } from './decimal.js';

/**
 * Reglas de cada moneda.
 *
 * - `decimales`: con cuántos decimales se fija y guarda un monto (columna de la base).
 * - `decimalesPantalla`: con cuántos se muestra.
 * - `redondeo`: cómo se descartan los decimales sobrantes.
 *
 * Política de redondeo del proyecto:
 * - COP y USD: ROUND_HALF_UP (0,005 → 0,01). COP se muestra sin decimales (D21).
 * - VES: se TRUNCA al tercer decimal (D15): 49800 ÷ 3,76 = 13244,6808… → 13244,680.
 */
export const MONEDAS = {
  COP: { codigo: 'COP', decimales: 2, decimalesPantalla: 0, redondeo: Decimal.ROUND_HALF_UP },
  USD: { codigo: 'USD', decimales: 2, decimalesPantalla: 2, redondeo: Decimal.ROUND_HALF_UP },
  VES: { codigo: 'VES', decimales: 3, decimalesPantalla: 3, redondeo: Decimal.ROUND_DOWN },
} as const;

export type Moneda = keyof typeof MONEDAS;

/** Decimales con que se guardan las tasas y los márgenes (columna Decimal(18,6)). */
export const DECIMALES_TASA = 6;
