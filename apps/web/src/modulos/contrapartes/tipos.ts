import type { TipoContraparte, TipoMovimientoContraparte } from '@cambios-jc/shared';

export interface SaldoContraparte {
  moneda: string;
  /** Positivo: me debe. Negativo: le debo. En pantalla solo se muestran esas etiquetas. */
  saldo: string;
}

export interface Contraparte {
  id: string;
  nombre: string;
  tipo: TipoContraparte;
  documento: string | null;
  telefono: string | null;
  notas: string | null;
  activa: boolean;
  creadoEn: string;
  saldos: SaldoContraparte[];
  cuentasTitular: { id: string; nombre: string; moneda: string }[];
}

export interface MovimientoContraparte {
  id: string;
  tipo: TipoMovimientoContraparte;
  moneda: string;
  monto: string;
  signo: 1 | -1;
  cuenta: { id: string; nombre: string } | null;
  nota: string | null;
  revierteId: string | null;
  anulacion: {
    id: string;
    motivo: string | null;
    por: { id: string; nombre: string };
    en: string;
  } | null;
  compraId: string | null;
  usuario: { id: string; nombre: string };
  creadoEn: string;
}

export interface DatosContraparte {
  nombre: string;
  tipo: TipoContraparte;
  documento?: string | null;
  telefono?: string | null;
  notas?: string | null;
  activa?: boolean;
}

export interface DatosMovimiento {
  claveIdempotencia: string;
  tipo: TipoMovimientoContraparte;
  moneda: string;
  monto: string;
  signo?: 1 | -1;
  cuentaId?: string;
  nota?: string;
}

export interface OpcionesContraparte {
  contrapartes: { id: string; nombre: string; tipo: TipoContraparte }[];
  cuentas: { id: string; nombre: string; tipo: 'caja' | 'banco' | 'billetera'; moneda: string }[];
}

export const ETIQUETAS_TIPO_CONTRAPARTE: Record<TipoContraparte, string> = {
  proveedor: 'Proveedor de divisas',
  familiar: 'Familiar',
  socio: 'Socio',
  tercero: 'Tercero',
  otro: 'Otro',
};

export const ETIQUETAS_MOVIMIENTO: Record<TipoMovimientoContraparte, string> = {
  prestamo_otorgado: 'Préstamo que le doy',
  prestamo_recibido: 'Préstamo que me hace',
  abono_recibido: 'Abono que me hace',
  abono_entregado: 'Abono que le hago',
  anticipo_proveedor: 'Anticipo a proveedor',
  compra_credito: 'Compra a crédito',
  ajuste: 'Ajuste (corrección)',
  otro: 'Otro',
};
