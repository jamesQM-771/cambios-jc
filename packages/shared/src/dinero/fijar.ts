import type { Decimal, ValorDecimal } from './decimal.js';
import { MONEDAS, type Moneda } from './monedas.js';
import { aDecimal, normalizarCero } from './serializacion.js';

/**
 * Fija un monto final con los decimales y el modo de redondeo de su moneda (ver monedas.ts).
 * Es el único lugar donde se descartan decimales de un monto.
 */
export function fijarMonto(valor: ValorDecimal, moneda: Moneda): Decimal {
  const { decimales, redondeo } = MONEDAS[moneda];
  return normalizarCero(aDecimal(valor).toDecimalPlaces(decimales, redondeo));
}

/** Texto para JSON de un monto ya fijado, con todos sus decimales: "162000.00", "43085.106". */
export function montoATexto(valor: ValorDecimal, moneda: Moneda): string {
  return fijarMonto(valor, moneda).toFixed(MONEDAS[moneda].decimales);
}
