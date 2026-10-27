export type TipoGasto = 'operativo' | 'retiro_dueno';

export const ETIQUETAS_TIPO_GASTO: Record<TipoGasto, string> = {
  operativo: 'Gasto',
  retiro_dueno: 'Retiro del dueño',
};

export interface Gasto {
  id: string;
  tipo: TipoGasto;
  categoria: { id: string; nombre: string } | null;
  descripcion: string;
  cuenta: {
    id: string;
    nombre: string;
    moneda: string;
    sucursal: { id: string; nombre: string };
  };
  monto: string;
  turno: { id: string; caja: { id: string; nombre: string } } | null;
  creadoPor: { id: string; nombre: string };
  creadoEn: string;
  anulado: { por: { id: string; nombre: string }; en: string; motivo: string } | null;
}

export interface CuentaParaGasto {
  id: string;
  nombre: string;
  tipo: 'caja' | 'banco' | 'billetera';
  moneda: string;
  /** Caja a la que pertenece una cuenta de efectivo; `null` en bancos, billeteras y la bóveda. */
  cajaId: string | null;
}

export interface OpcionesGasto {
  categorias: { id: string; nombre: string }[];
  cuentas: CuentaParaGasto[];
  miTurno: { id: string; caja: { id: string; nombre: string } } | null;
  /** `true` si puede pagar desde cualquier cuenta y registrar retiros del dueño (administrador). */
  puedeGestionar: boolean;
}

export interface DatosGasto {
  claveIdempotencia: string;
  tipo: TipoGasto;
  categoriaId?: string;
  descripcion: string;
  cuentaId: string;
  monto: string;
}
