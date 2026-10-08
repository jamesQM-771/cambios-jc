import type { Moneda } from '@cambios-jc/shared';

interface DenominacionSemilla {
  moneda: Moneda;
  valor: string;
}

const paraMoneda =
  (moneda: Moneda) =>
  (valor: string): DenominacionSemilla => ({ moneda, valor });

/**
 * Billetes y monedas reales en circulación, para la semilla del catálogo (tarea 1.4). Son valores de
 * referencia: que estén aquí no implica que esta instalación opere esa moneda en efectivo (eso lo
 * decide la línea de negocio; en Cambios JC, bolívares en efectivo está desactivada, D-confirmación #6).
 *
 * - COP: billetes y monedas de curso legal en Colombia (Banco de la República) en 2026.
 * - USD: solo billetes (de 1 a 100); una casa de cambio no suele recibir monedas de dólar.
 * - VES: billetes del cono monetario vigente tras la reconversión de 2021 (sin céntimos, ya fuera
 *   de circulación práctica). Aproximado: sirve de referencia para otras instalaciones.
 */
export const DENOMINACIONES_SEMILLA: readonly DenominacionSemilla[] = [
  ...['100000', '50000', '20000', '10000', '5000', '2000', '1000', '500', '200', '100', '50'].map(
    paraMoneda('COP'),
  ),
  ...['100', '50', '20', '10', '5', '2', '1'].map(paraMoneda('USD')),
  ...['200', '100', '50', '20', '10', '5', '1'].map(paraMoneda('VES')),
];
