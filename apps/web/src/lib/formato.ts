import { MONEDAS, type Moneda, type Rol } from '@cambios-jc/shared';

export const ETIQUETAS_ROL: Record<Rol, string> = {
  administrador: 'Administrador',
  vendedor: 'Vendedor',
  digitador: 'Digitador',
};

export const MONEDAS_SOPORTADAS = Object.keys(MONEDAS) as Moneda[];

export const ETIQUETAS_MONEDA: Record<Moneda, string> = {
  COP: 'Pesos colombianos (COP)',
  USD: 'Dólares (USD)',
  VES: 'Bolívares (VES)',
};

/** Fecha y hora para mostrar, en la zona horaria de la empresa (CLAUDE.md §6: se guarda en UTC). */
export function formatearFechaHora(iso: string, zonaHoraria: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: zonaHoraria,
  }).format(new Date(iso));
}

/**
 * Tasa o porcentaje para mostrar: coma decimal, punto de miles y sin ceros de relleno
 * ("5.190000" → "5,19", "3200.000000" → "3.200,00", "11.000000" con 0 decimales mínimos → "11").
 * Solo reacomoda el texto que llega de la API: no convierte a número ni redondea (CLAUDE.md §6).
 */
export function formatearTasa(valor: string, decimalesMinimos = 2): string {
  const [entera = '', fraccion = ''] = valor.split('.');
  const sinCeros = fraccion.replace(/0+$/, '');
  const decimales = sinCeros.padEnd(decimalesMinimos, '0');
  const miles = entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimales === '' ? miles : `${miles},${decimales}`;
}

/**
 * Número escrito a mano, listo para la API: acepta coma o punto como decimal ("4,68" y "4.68" →
 * "4.68") y quita los puntos de miles cuando hay coma ("3.200,50" → "3200.50"). No valida: si lo
 * escrito no es un número, la API responde con su error.
 */
export function normalizarDecimal(texto: string): string {
  const limpio = texto.trim().replace(/\s/g, '');
  if (!limpio.includes(',')) return limpio;
  return limpio.replace(/\./g, '').replace(',', '.');
}

/**
 * Lo escrito se puede leer de dos maneras: "3.200" es tres mil doscientos para quien usa el punto
 * de miles y tres coma dos para la API. Publicar la lectura equivocada de una tasa es plata
 * perdida, así que en ese caso no se adivina: se pide escribirlo sin ambigüedad.
 */
export function decimalAmbiguo(texto: string): boolean {
  return /^\d{1,3}(\.\d{3})+$/.test(texto.trim());
}

/** Mensaje para un valor ambiguo, con las dos formas de escribirlo bien; `null` si está claro. */
export function avisoDecimalAmbiguo(texto: string): string | null {
  if (!decimalAmbiguo(texto)) return null;
  const limpio = texto.trim();
  const comoMiles = limpio.replace(/\./g, '');
  const comoDecimal = limpio.replace('.', ',');
  return `No queda claro si es ${comoMiles} o ${comoDecimal}. Escribe ${comoMiles} (sin punto de miles) o ${comoDecimal} (con coma decimal).`;
}
