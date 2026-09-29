import { Decimal, type ValorDecimal } from './decimal.js';
import { ErrorDinero } from './errores.js';

// Solo dígitos, punto decimal opcional y signo menos opcional. Sin comas, espacios ni exponentes.
const PATRON_DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * Lee un valor que llega como texto (JSON, formulario, archivo) y lo convierte a Decimal.
 * Rechaza cualquier cosa que no sea texto con formato "162000.50": en JSON el dinero viaja como string.
 */
export function leerDecimal(valor: unknown): Decimal {
  if (typeof valor !== 'string') {
    throw new ErrorDinero(
      'VALOR_INVALIDO',
      'El valor debe llegar como texto, por ejemplo "162000.00".',
    );
  }
  if (!PATRON_DECIMAL.test(valor)) {
    throw new ErrorDinero(
      'VALOR_INVALIDO',
      `"${valor}" no es un número válido. Usa punto decimal y sin separador de miles.`,
    );
  }
  return normalizarCero(new Decimal(valor));
}

/** Convierte cualquier ValorDecimal a un Decimal de este módulo. */
export function aDecimal(valor: ValorDecimal): Decimal {
  if (typeof valor === 'string') return leerDecimal(valor);
  return normalizarCero(new Decimal(valor));
}

/** Texto para JSON, sin notación científica ni ceros de relleno: "43085.106". */
export function aTexto(valor: ValorDecimal): string {
  return aDecimal(valor).toFixed();
}

/** Evita el "-0" de decimal.js: un cero siempre es cero positivo. */
export function normalizarCero(valor: Decimal): Decimal {
  return valor.isZero() ? new Decimal(0) : valor;
}
