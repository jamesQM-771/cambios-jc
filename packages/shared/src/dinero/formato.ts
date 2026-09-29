import type { ValorDecimal } from './decimal.js';
import { MONEDAS, type Moneda } from './monedas.js';
import { aDecimal, normalizarCero } from './serializacion.js';

/**
 * Formato de pantalla con la moneda explícita (nunca "$" solo):
 * `COP 162.000`, `VES 43.085,106`, `USD 150,00`, `-COP 1.000`.
 * Miles con ".", decimales con ",".
 */
export function formatearMoneda(valor: ValorDecimal, moneda: Moneda): string {
  const { codigo, decimalesPantalla, redondeo } = MONEDAS[moneda];
  const ajustado = normalizarCero(aDecimal(valor).toDecimalPlaces(decimalesPantalla, redondeo));
  const signo = ajustado.isNegative() ? '-' : '';
  const [entero = '0', fraccion] = ajustado.abs().toFixed(decimalesPantalla).split('.');
  const enteroConMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${signo}${codigo} ${enteroConMiles}${fraccion === undefined ? '' : `,${fraccion}`}`;
}
