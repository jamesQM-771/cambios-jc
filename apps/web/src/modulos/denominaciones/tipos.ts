import type { Moneda } from '@cambios-jc/shared';

export interface Denominacion {
  id: string;
  moneda: Moneda;
  /** Con los decimales propios de su moneda, como texto: "50000.00", "1.000". */
  valor: string;
  activa: boolean;
}

export interface DatosDenominacionNueva {
  moneda: Moneda;
  valor: string;
}

export interface CambiosDenominacion {
  valor: string;
}
