export interface Resumen {
  id: string;
  nombre: string;
}

export interface Compra {
  id: string;
  contraparte: Resumen;
  moneda: string;
  cantidad: string;
  tasa: string;
  montoPesos: string;
  cuentaDestino: Resumen;
  formaPago: 'contado' | 'credito';
  cuentaPago: Resumen | null;
  nota: string | null;
  creadoPor: Resumen;
  creadoEn: string;
  anulado: { por: Resumen; en: string; motivo: string } | null;
}

export interface OpcionesCompra {
  monedaLocal: string;
  contrapartes: { id: string; nombre: string; saldoLocal: string }[];
  cuentasDestino: {
    id: string;
    nombre: string;
    moneda: string;
    contraparteTitularId: string | null;
  }[];
  cuentasPago: { id: string; nombre: string; moneda: string }[];
}

export interface DatosCompra {
  claveIdempotencia: string;
  contraparteId: string;
  cuentaDestinoId: string;
  cantidad: string;
  tasa: string;
  formaPago: 'contado' | 'credito';
  cuentaPagoId?: string;
  nota?: string;
}
