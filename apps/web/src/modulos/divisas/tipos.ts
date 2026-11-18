export interface Resumen {
  id: string;
  nombre: string;
}

export interface OperacionDivisa {
  id: string;
  numeroComprobante: number;
  tipo: 'compra' | 'venta';
  lineaNegocio: Resumen;
  moneda: string;
  montoDivisa: string;
  montoPesos: string;
  tasaCalculada: string;
  tasaUsada: string;
  motivoTasa: string | null;
  clienteNombre: string | null;
  clienteDocumento: string | null;
  turno: { id: string; caja: Resumen };
  billetes: { sentido: 'entrada' | 'salida'; moneda: string; valor: string; cantidad: number }[];
  ganancia: { costoPromedio: string; ganancia: string } | null;
  creadoPor: Resumen;
  creadoEn: string;
  anulado: { por: Resumen; en: string; motivo: string } | null;
}

export interface LineaDivisa {
  id: string;
  nombre: string;
  moneda: string;
  monedaLocal: string;
  tasaCompra: string | null;
  tasaVenta: string | null;
  denominaciones: { id: string; valor: string }[];
}

export interface OpcionesDivisa {
  lineas: LineaDivisa[];
  miTurno: { id: string; caja: Resumen; monedas: string[] } | null;
  puedeCambiarTasa: boolean;
}

export interface DatosDivisa {
  claveIdempotencia: string;
  tipo: 'compra' | 'venta';
  lineaNegocioId: string;
  montoDivisa: string;
  billetes: { denominacionId: string; cantidad: number }[];
  tasaManual?: { tasa: string; motivo: string };
  clienteNombre?: string;
  clienteDocumento?: string;
}

export interface ReciboDivisa {
  esCopia: boolean;
  operacion: OperacionDivisa;
  empresa: {
    nombre: string;
    nit: string | null;
    whatsapp: string | null;
    textoPie: string | null;
    zonaHoraria: string;
  };
}
