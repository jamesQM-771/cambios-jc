import { comparar, type Moneda } from '@cambios-jc/shared';

import type { Prisma } from '../../generated/prisma/client.js';
import { registrarMovimiento } from '../../lib/libro.js';

/**
 * Qué mueve una remesa en el libro de las cuentas (D121):
 * - el dinero del cliente entra a la cuenta de ingreso (en efectivo, al registrar; por transferencia,
 *   cuando el vendedor verifica que llegó);
 * - si se anula antes de pagarse, ese ingreso se revierte con un movimiento contrario;
 * - al completarse, de la cuenta desde la que pagó el digitador salen los bolívares y el costo bancario.
 */

/**
 * Turno abierto de quien hace el movimiento (D123): así el arqueo de su caja sabe qué entró y salió
 * durante su turno. El digitador y el administrador sin turno lo dejan en `null`.
 */
async function turnoAbiertoDe(
  tx: Prisma.TransactionClient,
  usuarioId: string,
): Promise<string | null> {
  const turno = await tx.turno.findUnique({
    where: { usuarioEnUso: usuarioId },
    select: { id: true },
  });
  return turno?.id ?? null;
}

/** Entra a la cuenta de ingreso lo que entregó el cliente. */
export async function ingresarPorRemesa(
  tx: Prisma.TransactionClient,
  operacionId: string,
  usuarioId: string,
): Promise<void> {
  const operacion = await tx.operacion.findUniqueOrThrow({
    where: { id: operacionId },
    select: {
      cuentaIngresoId: true,
      montoPesos: true,
      lineaNegocio: { select: { monedaOrigen: true } },
    },
  });
  await registrarMovimiento(tx, {
    cuentaId: operacion.cuentaIngresoId,
    sentido: 'entrada',
    monto: operacion.montoPesos.toString(),
    moneda: operacion.lineaNegocio.monedaOrigen as Moneda,
    origen: 'remesa_ingreso',
    operacionId,
    turnoId: await turnoAbiertoDe(tx, usuarioId),
    usuarioId,
  });
}

/** Deshace el ingreso de una remesa anulada (si llegó a haberlo): sale lo mismo que entró. */
export async function revertirIngresoDeRemesa(
  tx: Prisma.TransactionClient,
  operacionId: string,
  usuarioId: string,
): Promise<void> {
  const ingreso = await tx.movimientoCuenta.findFirst({
    where: { operacionId, origen: 'remesa_ingreso', reversion: { is: null } },
    include: { cuenta: { select: { moneda: true } } },
  });
  // Una transferencia anulada antes de verificarse no recibió nada: no hay qué revertir.
  if (!ingreso) return;
  await registrarMovimiento(tx, {
    cuentaId: ingreso.cuentaId,
    sentido: 'salida',
    monto: ingreso.monto.toString(),
    moneda: ingreso.cuenta.moneda as Moneda,
    origen: 'remesa_anulacion',
    operacionId,
    revierteId: ingreso.id,
    turnoId: await turnoAbiertoDe(tx, usuarioId),
    usuarioId,
  });
}

interface DatosPago {
  operacionId: string;
  /** Cuenta desde la que pagó el digitador. */
  cuentaOrigenId: string;
  moneda: Moneda;
  /** Costo bancario cargado (o la comisión por defecto de la cuenta); `null` si no hubo. */
  costo: string | null;
  usuarioId: string;
}

/** Salen de la cuenta de origen los bolívares pagados y, si lo hubo, el costo del banco. */
export async function pagarRemesa(tx: Prisma.TransactionClient, datos: DatosPago): Promise<void> {
  const operacion = await tx.operacion.findUniqueOrThrow({
    where: { id: datos.operacionId },
    select: { montoBolivares: true },
  });
  await registrarMovimiento(tx, {
    cuentaId: datos.cuentaOrigenId,
    sentido: 'salida',
    monto: operacion.montoBolivares.toString(),
    moneda: datos.moneda,
    origen: 'remesa_pago',
    operacionId: datos.operacionId,
    usuarioId: datos.usuarioId,
  });
  if (datos.costo !== null && comparar(datos.costo, '0') > 0) {
    await registrarMovimiento(tx, {
      cuentaId: datos.cuentaOrigenId,
      sentido: 'salida',
      monto: datos.costo,
      moneda: datos.moneda,
      origen: 'remesa_costo',
      operacionId: datos.operacionId,
      usuarioId: datos.usuarioId,
    });
  }
}
