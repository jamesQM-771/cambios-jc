import {
  fijarMonto,
  restar,
  sumar,
  type Decimal,
  type Moneda,
  type ValorDecimal,
} from '@cambios-jc/shared';

import type { OrigenMovimiento, Prisma, SentidoMovimiento } from '../generated/prisma/client.js';

import type { PrismaClient } from './prisma.js';

export interface DatosMovimiento {
  cuentaId: string;
  sentido: SentidoMovimiento;
  /** Siempre positivo: el sentido dice si entra o sale. */
  monto: ValorDecimal;
  /** Moneda de la cuenta; fija los decimales con que se guarda el monto. */
  moneda: Moneda;
  origen: OrigenMovimiento;
  operacionId?: string | undefined;
  /** Traslado del que forma parte este movimiento (sus dos patas). */
  trasladoId?: string | undefined;
  /** Gasto o retiro del dueño que lo causó. */
  gastoId?: string | undefined;
  /** Movimiento de cuenta corriente con una contraparte que movió este dinero. */
  movimientoContraparteId?: string | undefined;
  /** Compra de divisa que lo causó. */
  compraId?: string | undefined;
  turnoId?: string | null | undefined;
  /** El movimiento que este deshace (anulaciones y correcciones): se revierte una sola vez. */
  revierteId?: string | undefined;
  usuarioId: string;
}

/**
 * Anota una entrada o salida en el libro de una cuenta (D120). Va siempre dentro de la misma
 * transacción que la operación que la causa: o quedan las dos o no queda ninguna.
 */
export async function registrarMovimiento(
  tx: Prisma.TransactionClient,
  datos: DatosMovimiento,
): Promise<string> {
  const monto = fijarMonto(datos.monto, datos.moneda);
  if (monto.lte(0)) throw new Error('Un movimiento de cuenta debe ser mayor que cero.');
  const creado = await tx.movimientoCuenta.create({
    data: {
      cuentaId: datos.cuentaId,
      sentido: datos.sentido,
      monto: monto.toString(),
      origen: datos.origen,
      operacionId: datos.operacionId ?? null,
      trasladoId: datos.trasladoId ?? null,
      gastoId: datos.gastoId ?? null,
      movimientoContraparteId: datos.movimientoContraparteId ?? null,
      compraId: datos.compraId ?? null,
      turnoId: datos.turnoId ?? null,
      revierteId: datos.revierteId ?? null,
      usuarioId: datos.usuarioId,
    },
    select: { id: true },
  });
  return creado.id;
}

export interface VentanaDeTiempo {
  /** Incluye este instante. */
  desde?: Date | undefined;
  /** No incluye este instante. */
  hasta?: Date | undefined;
}

/**
 * Saldo de una cuenta según el libro: entradas − salidas, sin redondear (la suma conserva toda la
 * precisión). Con ventana, solo cuenta los movimientos de ese periodo: así se calcula lo que se
 * movió durante un turno (§7.6: esperado = apertura + entradas − salidas).
 */
export async function saldoDeCuenta(
  cliente: Pick<PrismaClient | Prisma.TransactionClient, 'movimientoCuenta'>,
  cuentaId: string,
  ventana: VentanaDeTiempo = {},
): Promise<Decimal> {
  const filas = await cliente.movimientoCuenta.groupBy({
    by: ['sentido'],
    where: {
      cuentaId,
      ...(ventana.desde || ventana.hasta
        ? {
            creadoEn: {
              ...(ventana.desde ? { gte: ventana.desde } : {}),
              ...(ventana.hasta ? { lt: ventana.hasta } : {}),
            },
          }
        : {}),
    },
    _sum: { monto: true },
  });
  const total = (sentido: SentidoMovimiento) =>
    filas.find((fila) => fila.sentido === sentido)?._sum.monto?.toString() ?? '0';
  return restar(sumar('0', total('entrada')), total('salida'));
}
