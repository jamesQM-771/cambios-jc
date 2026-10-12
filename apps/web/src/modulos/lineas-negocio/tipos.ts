import type { Moneda } from '@cambios-jc/shared';

export type ClaseLinea = 'remesa' | 'divisa_caja';
export type ModoTasa = 'directo' | 'porcentaje';

export interface LineaNegocio {
  id: string;
  nombre: string;
  clase: ClaseLinea;
  monedaOrigen: string;
  monedaDestino: string;
  activa: boolean;
  modoTasa: ModoTasa;
  /** Como texto, con 6 decimales (D69). Null si la línea es "directo" o no se configuró. */
  margenCompra: string | null;
  margenVenta: string | null;
}

export interface DatosLineaNegocioNueva {
  nombre: string;
  clase: ClaseLinea;
  monedaOrigen: Moneda;
  monedaDestino: Moneda;
}

export interface CambiosLineaNegocio {
  nombre: string;
}

export type ConfiguracionTasaLinea =
  { modoTasa: 'directo' } | { modoTasa: 'porcentaje'; margenVenta: string; margenCompra?: string };
