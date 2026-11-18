export interface Inventario {
  moneda: string;
  cantidad: string;
  costoPromedio: string | null;
  saldoCuentas: string;
  actualizadoEn: string | null;
}

export interface MovimientoInventario {
  id: string;
  origen:
    | 'ajuste'
    | 'compra'
    | 'compra_anulacion'
    | 'remesa_pago'
    | 'divisa_compra'
    | 'divisa_venta'
    | 'divisa_anulacion';
  sentido: 'entrada' | 'salida';
  cantidad: string;
  tasa: string | null;
  cantidadDespues: string;
  costoDespues: string | null;
  compraId: string | null;
  operacion: { id: string; numeroComprobante: number } | null;
  nota: string | null;
  usuario: { id: string; nombre: string };
  creadoEn: string;
}

export interface DatosAjuste {
  sentido: 'entrada' | 'salida';
  cantidad: string;
  tasa?: string;
  motivo: string;
}

export const ETIQUETAS_ORIGEN_INVENTARIO: Record<MovimientoInventario['origen'], string> = {
  ajuste: 'Ajuste',
  compra: 'Compra',
  compra_anulacion: 'Compra anulada',
  remesa_pago: 'Pago de remesa',
  divisa_compra: 'Compra en caja',
  divisa_venta: 'Venta en caja',
  divisa_anulacion: 'Operación en caja anulada',
};
