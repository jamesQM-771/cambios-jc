import { Decimal, type ValorDecimal } from '../dinero/decimal.js';
import { ErrorDinero } from '../dinero/errores.js';
import { aDecimal } from '../dinero/serializacion.js';

/**
 * Tasa de venta de una línea en modo "porcentaje" (D64): a la tasa del proveedor se le suma el
 * margen de ganancia del negocio, y el resultado se fija a 2 decimales (ROUND_HALF_UP).
 *
 * Ejemplo real: proveedor 4,68 + margen 11 % → 4,68 × 1,11 = 5,1948 → 5,19.
 */
export function tasaDesdeMargenPorcentaje(
  referencia: ValorDecimal,
  margenPorcentaje: ValorDecimal,
): Decimal {
  const valorReferencia = aDecimal(referencia);
  const valorMargen = aDecimal(margenPorcentaje);
  if (valorReferencia.lte(0)) {
    throw new ErrorDinero('TASA_INVALIDA', 'La tasa del proveedor debe ser mayor que cero.');
  }
  if (valorMargen.isNegative()) {
    throw new ErrorDinero('TASA_INVALIDA', 'El margen no puede ser negativo.');
  }
  const factor = new Decimal(1).plus(valorMargen.dividedBy(100));
  return valorReferencia.times(factor).toDecimalPlaces(2);
}
