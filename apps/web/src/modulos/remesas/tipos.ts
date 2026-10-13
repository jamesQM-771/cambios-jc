import type { TipoDocumento, TipoMedioPago } from '../clientes/tipos.js';

export const ESTADOS_REMESA = [
  'registrada',
  'pago_verificado',
  'en_cola',
  'tomada',
  'completada',
  'con_incidencia',
  'devuelta',
  'anulada',
] as const;
export type EstadoRemesa = (typeof ESTADOS_REMESA)[number];

export type FormaPago = 'efectivo' | 'transferencia';

interface PersonaRemesa {
  id: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  nombre: string;
}

/** Remesa tal como la ve quien vende (`GET /remesas`). El digitador nunca recibe esta forma. */
export interface Remesa {
  id: string;
  numeroComprobante: number;
  codigoSeguimiento: string;
  estado: EstadoRemesa;
  formaPago: FormaPago;
  lineaNegocio: { id: string; nombre: string };
  remitente: PersonaRemesa;
  beneficiario: {
    cliente: PersonaRemesa;
    medioPagoId: string;
    tipo: TipoMedioPago;
    banco: { codigo: string; nombre: string };
    numeroCuenta: string | null;
    telefonoPagoMovil: string | null;
    titular: string;
    tipoDocumentoTitular: TipoDocumento;
    numeroDocumentoTitular: string;
  };
  cuentaIngreso: { id: string; nombre: string };
  montoPesos: string;
  montoBolivares: string;
  tasaCalculada: string;
  tasaUsada: string;
  motivoTasa: string | null;
  pago: {
    operador: { id: string; nombre: string } | null;
    tomadaEn: string | null;
    cuentaOrigen: { id: string; nombre: string } | null;
    referenciaBancaria: string | null;
    costoBancario: string | null;
    tieneComprobante: boolean;
    completadaEn: string | null;
  };
  creadoPor: { id: string; nombre: string };
  creadoEn: string;
}

export interface EventoRemesa {
  estadoAnterior: EstadoRemesa | null;
  estadoNuevo: EstadoRemesa;
  motivo: string | null;
  usuario: { id: string; nombre: string };
  creadoEn: string;
}

/** Lo que el formulario de una remesa necesita y el vendedor no podría pedir en Configuración. */
export interface OpcionesRemesa {
  lineas: {
    id: string;
    nombre: string;
    monedaOrigen: string;
    monedaDestino: string;
    /** Tasa de venta vigente; `null` si todavía no se publicó una. */
    tasaVenta: string | null;
  }[];
  cuentasIngreso: {
    id: string;
    nombre: string;
    tipo: 'caja' | 'banco' | 'billetera';
    moneda: string;
  }[];
}

export interface DatosRemesaNueva {
  claveIdempotencia: string;
  lineaNegocioId: string;
  remitenteId: string;
  medioPagoId: string;
  formaPago: FormaPago;
  cuentaIngresoId: string;
  montoPesos?: string;
  montoBolivares?: string;
  tasaManual?: { tasa: string; motivo: string };
}

export const ETIQUETAS_ESTADO: Record<EstadoRemesa, string> = {
  registrada: 'Por verificar pago',
  pago_verificado: 'Pago verificado',
  en_cola: 'En cola',
  tomada: 'Pagando',
  completada: 'Completada',
  con_incidencia: 'Con incidencia',
  devuelta: 'Devuelta',
  anulada: 'Anulada',
};

/** Color de la etiqueta de estado: lo que pide acción, en alerta; lo terminado, en éxito. */
export const TONO_ESTADO: Record<EstadoRemesa, 'exito' | 'alerta' | 'error' | 'neutro'> = {
  registrada: 'alerta',
  pago_verificado: 'neutro',
  en_cola: 'neutro',
  tomada: 'neutro',
  completada: 'exito',
  con_incidencia: 'error',
  devuelta: 'neutro',
  anulada: 'neutro',
};
