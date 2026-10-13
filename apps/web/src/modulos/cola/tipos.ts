import type { TipoDocumento, TipoMedioPago } from '../clientes/tipos.js';

/**
 * Una transferencia en la cola del digitador. Es lo único que recibe: a quién pagar y cuántos
 * bolívares, nunca pesos, tasa ni datos del remitente (D105). Mientras nadie la toma solo se ven el
 * banco y el monto; el resto aparece al tomarla.
 */
export interface ItemCola {
  id: string;
  estado: 'en_cola' | 'tomada';
  enviadaEn: string;
  montoBolivares: string;
  tomadaPorMi: boolean;
  pago: {
    tipo: TipoMedioPago;
    banco: { codigo: string; nombre: string };
    numeroCuenta: string | null;
    telefonoPagoMovil: string | null;
    titular: string | null;
    tipoDocumentoTitular: TipoDocumento | null;
    numeroDocumentoTitular: string | null;
  };
}

export interface CuentaOrigen {
  id: string;
  nombre: string;
  comisionPorDefecto: string | null;
}

export interface RespuestaCola {
  remesas: ItemCola[];
  cuentasOrigen: CuentaOrigen[];
  ultimaCuentaOrigenId: string | null;
}

export interface DatosCompletar {
  cuentaOrigenId: string;
  referenciaBancaria?: string;
  costoBancario?: string;
  captura: Blob;
}
