import { formatearMoneda, type Moneda } from '@cambios-jc/shared';

/**
 * Saldo con etiqueta, nunca con signo (§5.8): positivo = "Me debe", negativo = "Le debo".
 * Es solo formato: el saldo ya viene calculado por el servidor.
 */
export function etiquetaSaldo(moneda: string, saldo: string): string {
  const negativo = saldo.startsWith('-');
  const monto = formatearMoneda(negativo ? saldo.slice(1) : saldo, moneda as Moneda);
  return `${negativo ? 'Le debo' : 'Me debe'} ${monto}`;
}
