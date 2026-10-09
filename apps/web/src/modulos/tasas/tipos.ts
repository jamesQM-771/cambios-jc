export interface Tasa {
  id: string;
  lineaNegocioId: string;
  lineaNegocioNombre: string;
  tasaReferencia: string | null;
  margenUsado: string | null;
  tasaCompra: string | null;
  tasaVenta: string;
  publicadaPorId: string;
  publicadaPorNombre: string;
  motivo: string | null;
  vigenteDesde: string;
  vigenteHasta: string | null;
}

export type DatosPublicarTasa =
  | { modoTasa: 'porcentaje'; lineaNegocioId: string; tasaReferencia: string; motivo?: string }
  | {
      modoTasa: 'directo';
      lineaNegocioId: string;
      tasaVenta: string;
      tasaCompra?: string;
      motivo?: string;
    };
