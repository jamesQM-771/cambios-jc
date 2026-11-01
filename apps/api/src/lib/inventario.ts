import {
  aDecimal,
  entrarAlInventario,
  revertirEntrada,
  salirDelInventario,
  type Decimal,
  type EstadoInventario,
  type Moneda,
  type ValorDecimal,
} from '@cambios-jc/shared';

import type { OrigenInventario, Prisma } from '../generated/prisma/client.js';

/**
 * Inventario de divisas con costo promedio ponderado móvil (§7.3, D138). El estado vive en
 * `inventario_divisa` y cada cambio deja una fila de solo inserción en `movimiento_inventario` con el
 * antes y el después. Toda función va dentro de la transacción de la operación que la causa y bloquea
 * la fila de la moneda: dos compras o pagos a la vez se calculan uno detrás del otro.
 */

interface FilaInventario {
  cantidad: Prisma.Decimal;
  costo_promedio: Prisma.Decimal | null;
}

async function bloquear(tx: Prisma.TransactionClient, moneda: Moneda): Promise<EstadoInventario> {
  await tx.$executeRaw`INSERT INTO inventario_divisa (moneda) VALUES (${moneda}) ON CONFLICT (moneda) DO NOTHING`;
  const [fila] = await tx.$queryRaw<FilaInventario[]>`
    SELECT cantidad, costo_promedio FROM inventario_divisa WHERE moneda = ${moneda} FOR UPDATE`;
  if (!fila) throw new Error(`No se pudo leer el inventario de ${moneda}.`);
  return {
    cantidad: aDecimal(fila.cantidad.toString()),
    costoPromedio: fila.costo_promedio === null ? null : aDecimal(fila.costo_promedio.toString()),
  };
}

interface Referencias {
  compraId?: string | undefined;
  operacionId?: string | undefined;
  nota?: string | null | undefined;
  usuarioId: string;
}

async function guardar(
  tx: Prisma.TransactionClient,
  moneda: Moneda,
  antes: EstadoInventario,
  despues: EstadoInventario,
  movimiento: {
    origen: OrigenInventario;
    sentido: 'entrada' | 'salida';
    cantidad: ValorDecimal;
    tasa: Decimal | null;
  } & Referencias,
): Promise<void> {
  await tx.inventarioDivisa.update({
    where: { moneda },
    data: {
      cantidad: despues.cantidad.toString(),
      costoPromedio: despues.costoPromedio?.toString() ?? null,
      actualizadoEn: new Date(),
    },
  });
  await tx.movimientoInventario.create({
    data: {
      moneda,
      origen: movimiento.origen,
      sentido: movimiento.sentido,
      cantidad: aDecimal(movimiento.cantidad).toString(),
      tasa: movimiento.tasa?.toString() ?? null,
      cantidadAntes: antes.cantidad.toString(),
      costoAntes: antes.costoPromedio?.toString() ?? null,
      cantidadDespues: despues.cantidad.toString(),
      costoDespues: despues.costoPromedio?.toString() ?? null,
      compraId: movimiento.compraId ?? null,
      operacionId: movimiento.operacionId ?? null,
      nota: movimiento.nota ?? null,
      usuarioId: movimiento.usuarioId,
    },
  });
}

/** Entra divisa al inventario a una tasa (compra o ajuste) y recalcula el costo promedio. */
export async function entrarInventario(
  tx: Prisma.TransactionClient,
  datos: {
    moneda: Moneda;
    cantidad: ValorDecimal;
    tasa: ValorDecimal;
    origen: 'compra' | 'ajuste';
  } & Referencias,
): Promise<EstadoInventario> {
  const antes = await bloquear(tx, datos.moneda);
  const despues = entrarAlInventario(antes, datos.cantidad, datos.tasa, datos.moneda);
  await guardar(tx, datos.moneda, antes, despues, {
    ...datos,
    sentido: 'entrada',
    tasa: aDecimal(datos.tasa),
  });
  return despues;
}

/**
 * Sale divisa del inventario al costo promedio vigente (pago de una remesa o ajuste). Devuelve el
 * costo unitario con que salió, o `null` si todavía no hay costo conocido.
 */
export async function salirInventario(
  tx: Prisma.TransactionClient,
  datos: {
    moneda: Moneda;
    cantidad: ValorDecimal;
    origen: 'remesa_pago' | 'ajuste';
  } & Referencias,
): Promise<Decimal | null> {
  const antes = await bloquear(tx, datos.moneda);
  const { estado: despues, costoUnitario } = salirDelInventario(
    antes,
    datos.cantidad,
    datos.moneda,
  );
  await guardar(tx, datos.moneda, antes, despues, {
    ...datos,
    sentido: 'salida',
    tasa: costoUnitario,
  });
  return costoUnitario;
}

/** Deshace la entrada de una compra anulada (D139). */
export async function revertirCompraEnInventario(
  tx: Prisma.TransactionClient,
  datos: { moneda: Moneda; cantidad: ValorDecimal; tasa: ValorDecimal } & Referencias,
): Promise<void> {
  const antes = await bloquear(tx, datos.moneda);
  const despues = revertirEntrada(antes, datos.cantidad, datos.tasa, datos.moneda);
  await guardar(tx, datos.moneda, antes, despues, {
    ...datos,
    origen: 'compra_anulacion',
    sentido: 'salida',
    tasa: aDecimal(datos.tasa),
  });
}
