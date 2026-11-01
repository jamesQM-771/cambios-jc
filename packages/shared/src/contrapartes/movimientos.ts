/**
 * Cuenta corriente con una contraparte (PROYECTO.md §5.8, §7.5, D137).
 *
 * Internamente el saldo es positivo cuando la contraparte **me debe** y negativo cuando **le debo**;
 * en pantalla solo se muestran esas etiquetas. Cuando un movimiento mueve dinero físico, el sentido en
 * la cuenta del negocio es el contrario al de la deuda: si me debe más es porque salió plata (préstamo,
 * anticipo, abono que le hago) y si me debe menos es porque entró (abono que me hace, préstamo recibido).
 */

export const TIPOS_CONTRAPARTE = ['proveedor', 'familiar', 'socio', 'tercero', 'otro'] as const;
export type TipoContraparte = (typeof TIPOS_CONTRAPARTE)[number];

export const TIPOS_MOVIMIENTO_CONTRAPARTE = [
  'prestamo_otorgado',
  'prestamo_recibido',
  'abono_recibido',
  'abono_entregado',
  'anticipo_proveedor',
  'compra_credito',
  'ajuste',
  'otro',
] as const;
export type TipoMovimientoContraparte = (typeof TIPOS_MOVIMIENTO_CONTRAPARTE)[number];

export interface EfectoMovimiento {
  /** 1: me debe más (o le debo menos); -1: le debo más (o me debe menos); `null`: lo elige quien registra. */
  signo: 1 | -1 | null;
  /** Si puede mover dinero de una cuenta del negocio. */
  admiteCuenta: boolean;
  /** Si la cuenta es obligatoria (el tipo siempre implica plata que se movió). */
  exigeCuenta: boolean;
  /** Lo registra el sistema (una compra a crédito), no la pantalla de movimientos. */
  soloSistema: boolean;
}

const EFECTOS: Readonly<Record<TipoMovimientoContraparte, EfectoMovimiento>> = {
  prestamo_otorgado: { signo: 1, admiteCuenta: true, exigeCuenta: false, soloSistema: false },
  prestamo_recibido: { signo: -1, admiteCuenta: true, exigeCuenta: false, soloSistema: false },
  abono_recibido: { signo: -1, admiteCuenta: true, exigeCuenta: false, soloSistema: false },
  abono_entregado: { signo: 1, admiteCuenta: true, exigeCuenta: false, soloSistema: false },
  anticipo_proveedor: { signo: 1, admiteCuenta: true, exigeCuenta: true, soloSistema: false },
  compra_credito: { signo: -1, admiteCuenta: false, exigeCuenta: false, soloSistema: true },
  ajuste: { signo: null, admiteCuenta: false, exigeCuenta: false, soloSistema: false },
  otro: { signo: null, admiteCuenta: true, exigeCuenta: false, soloSistema: false },
};

export function efectoDeMovimiento(tipo: TipoMovimientoContraparte): EfectoMovimiento {
  return EFECTOS[tipo];
}

/** Sentido del dinero en la cuenta del negocio para un movimiento con ese signo. */
export function sentidoEnCuenta(signo: 1 | -1): 'entrada' | 'salida' {
  return signo === 1 ? 'salida' : 'entrada';
}
