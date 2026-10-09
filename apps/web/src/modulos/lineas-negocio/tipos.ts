import type { Moneda } from '@cambios-jc/shared';

export type ClaseLinea = 'remesa' | 'divisa_caja';

export interface LineaNegocio {
  id: string;
  nombre: string;
  clase: ClaseLinea;
  monedaOrigen: string;
  monedaDestino: string;
  activa: boolean;
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
