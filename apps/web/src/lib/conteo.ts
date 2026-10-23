import { montoATexto, multiplicar, sumar, type Moneda } from '@cambios-jc/shared';

/**
 * Cantidad escrita en un campo del conteo: solo dígitos, sin ceros a la izquierda y con un tope.
 * Lo que no sea un entero válido queda vacío (se cuenta como cero).
 */
export function limpiarCantidad(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 7);
  return digitos === '' ? '' : String(Number.parseInt(digitos, 10));
}

export const cantidadDe = (texto: string | undefined): number =>
  texto === undefined || texto === '' ? 0 : Number.parseInt(texto, 10);

/**
 * Subtotal de una denominación y total de un conteo, solo para mostrarlos mientras se cuenta. Usa la
 * aritmética decimal de `shared`; el servidor recalcula todo y es la fuente de verdad (CLAUDE.md §6).
 */
export function subtotalDe(valor: string, cantidad: number, moneda: Moneda): string {
  return montoATexto(multiplicar(valor, String(cantidad)), moneda);
}

export function totalDe(
  lineas: readonly { valor: string; cantidad: number }[],
  moneda: Moneda,
): string {
  let total = sumar('0', '0');
  for (const linea of lineas)
    total = sumar(total, multiplicar(linea.valor, String(linea.cantidad)));
  return montoATexto(total, moneda);
}
