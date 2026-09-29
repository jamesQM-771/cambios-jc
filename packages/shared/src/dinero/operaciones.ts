import type { Decimal, ValorDecimal } from './decimal.js';
import { ErrorDinero } from './errores.js';
import { aDecimal } from './serializacion.js';

// Operaciones sin redondeo a decimales: el resultado conserva la precisión completa
// y solo se fija con fijarMonto() cuando es un monto final.

export function sumar(a: ValorDecimal, b: ValorDecimal): Decimal {
  return aDecimal(a).plus(aDecimal(b));
}

export function restar(a: ValorDecimal, b: ValorDecimal): Decimal {
  return aDecimal(a).minus(aDecimal(b));
}

export function multiplicar(a: ValorDecimal, b: ValorDecimal): Decimal {
  return aDecimal(a).times(aDecimal(b));
}

export function dividir(a: ValorDecimal, b: ValorDecimal): Decimal {
  const divisor = aDecimal(b);
  if (divisor.isZero())
    throw new ErrorDinero('DIVISION_POR_CERO', 'No se puede dividir entre cero.');
  return aDecimal(a).dividedBy(divisor);
}

/** -1 si a < b, 0 si son iguales, 1 si a > b. */
export function comparar(a: ValorDecimal, b: ValorDecimal): -1 | 0 | 1 {
  return aDecimal(a).comparedTo(aDecimal(b)) as -1 | 0 | 1;
}
