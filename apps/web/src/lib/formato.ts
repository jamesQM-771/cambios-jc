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
