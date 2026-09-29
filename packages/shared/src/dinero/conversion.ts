import { DecimalTruncado, type Decimal, type ValorDecimal } from './decimal.js';
import { ErrorDinero } from './errores.js';
import { fijarMonto } from './fijar.js';
import { multiplicar } from './operaciones.js';
import { aDecimal } from './serializacion.js';

function validarEntradas(monto: Decimal, tasa: Decimal): void {
  if (tasa.lte(0)) throw new ErrorDinero('TASA_INVALIDA', 'La tasa debe ser mayor que cero.');
  if (monto.isNegative())
    throw new ErrorDinero('MONTO_NEGATIVO', 'El monto no puede ser negativo.');
}

/**
 * Remesa COP → VES: bolívares = pesos ÷ tasa, truncado a 3 decimales (D15).
 *
 * La división se hace truncando (DecimalTruncado) para que el redondeo interno de los
 * 40 dígitos nunca suba el valor antes de truncar: el resultado es exacto.
 * Ejemplo: 162000 ÷ 3,76 = 43085,106382… → 43085,106.
 */
export function bolivaresDesdePesos(pesos: ValorDecimal, tasa: ValorDecimal): Decimal {
  const montoPesos = aDecimal(pesos);
  const valorTasa = aDecimal(tasa);
  validarEntradas(montoPesos, valorTasa);
  const cociente = new DecimalTruncado(montoPesos).dividedBy(valorTasa);
  return fijarMonto(cociente.toString(), 'VES');
}

/** Divisas en caja: pesos = divisa × tasa, fijado a 2 decimales con ROUND_HALF_UP. */
export function pesosDesdeDivisa(divisa: ValorDecimal, tasa: ValorDecimal): Decimal {
  const montoDivisa = aDecimal(divisa);
  const valorTasa = aDecimal(tasa);
  validarEntradas(montoDivisa, valorTasa);
  return fijarMonto(multiplicar(montoDivisa, valorTasa), 'COP');
}
