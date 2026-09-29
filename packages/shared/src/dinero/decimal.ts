import { Decimal as DecimalJs } from 'decimal.js';

/**
 * Decimal del proyecto: copia aislada de decimal.js para no tocar la configuración global.
 *
 * - 40 dígitos significativos: sobra para montos de 18 dígitos y tasas de 6 decimales.
 * - Redondeo por defecto ROUND_HALF_UP (CLAUDE.md §6). Solo se aplica al fijar un monto
 *   final o al mostrarlo; las operaciones intermedias no redondean a decimales.
 * - Límites de exponente amplios para que toString() nunca use notación científica.
 */
export const Decimal = DecimalJs.clone({
  precision: 40,
  rounding: DecimalJs.ROUND_HALF_UP,
  toExpNeg: -40,
  toExpPos: 40,
});
export type Decimal = InstanceType<typeof Decimal>;

/** Igual que Decimal pero truncando: para divisiones cuyo resultado se va a truncar. */
export const DecimalTruncado = Decimal.clone({ rounding: DecimalJs.ROUND_DOWN });

/**
 * Valor aceptado por las funciones de dinero: un Decimal (de este módulo, de Prisma o de
 * cualquier copia de decimal.js) o un texto. Nunca `number` (CLAUDE.md §6).
 */
export type ValorDecimal = DecimalJs | string;
