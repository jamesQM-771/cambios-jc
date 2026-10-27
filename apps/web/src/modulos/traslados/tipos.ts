export interface CuentaResumen {
  id: string;
  nombre: string;
  moneda: string;
}

export interface Traslado {
  id: string;
  origen: CuentaResumen;
  destino: CuentaResumen;
  monto: string;
  nota: string | null;
  turno: { id: string; caja: { id: string; nombre: string } } | null;
  creadoPor: { id: string; nombre: string };
  creadoEn: string;
  anulado: { por: { id: string; nombre: string }; en: string; motivo: string } | null;
}

export interface CuentaParaTraslado extends CuentaResumen {
  tipo: 'caja' | 'banco' | 'billetera';
  /** Caja a la que pertenece una cuenta de efectivo; `null` en bancos, billeteras y la bóveda. */
  cajaId: string | null;
}

export interface OpcionesTraslado {
  cuentas: CuentaParaTraslado[];
  miTurno: { id: string; caja: { id: string; nombre: string } } | null;
  puedeCualquierCuenta: boolean;
}

export interface DatosTraslado {
  claveIdempotencia: string;
  origenId: string;
  destinoId: string;
  monto: string;
  nota?: string;
}
