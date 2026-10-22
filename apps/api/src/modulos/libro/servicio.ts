import {
  finDelDia,
  inicioDelDia,
  montoATexto,
  restar,
  sumar,
  type Moneda,
} from '@cambios-jc/shared';

import type { PrismaClient } from '../../lib/prisma.js';

import type { MovimientoPublico } from './esquemas.js';

const MAXIMO_MOVIMIENTOS = 200;

export type ServicioLibro = ReturnType<typeof crearServicioLibro>;

export function crearServicioLibro({ prisma }: { prisma: PrismaClient }) {
  return {
    /** Saldo de cada cuenta activa según el libro de movimientos. */
    async saldos() {
      const [cuentas, sumas] = await Promise.all([
        prisma.cuentaDinero.findMany({
          where: { activa: true },
          orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
          select: {
            id: true,
            nombre: true,
            tipo: true,
            moneda: true,
            caja: { select: { id: true, nombre: true } },
          },
        }),
        prisma.movimientoCuenta.groupBy({ by: ['cuentaId', 'sentido'], _sum: { monto: true } }),
      ]);
      return cuentas.map((cuenta) => {
        const total = (sentido: 'entrada' | 'salida') =>
          sumas
            .find((fila) => fila.cuentaId === cuenta.id && fila.sentido === sentido)
            ?._sum.monto?.toString() ?? '0';
        return {
          cuenta,
          saldo: montoATexto(
            restar(sumar('0', total('entrada')), total('salida')),
            cuenta.moneda as Moneda,
          ),
        };
      });
    },

    async movimientos(filtro: {
      cuentaId?: string | undefined;
      desde?: string | undefined;
      hasta?: string | undefined;
    }): Promise<MovimientoPublico[]> {
      const empresa = await prisma.empresa.findUnique({ where: { unica: true } });
      const zona = empresa?.zonaHoraria ?? 'America/Bogota';
      const filas = await prisma.movimientoCuenta.findMany({
        where: {
          ...(filtro.cuentaId ? { cuentaId: filtro.cuentaId } : {}),
          ...(filtro.desde || filtro.hasta
            ? {
                creadoEn: {
                  ...(filtro.desde ? { gte: inicioDelDia(filtro.desde, zona) } : {}),
                  ...(filtro.hasta ? { lte: finDelDia(filtro.hasta, zona) } : {}),
                },
              }
            : {}),
        },
        orderBy: { creadoEn: 'desc' },
        take: MAXIMO_MOVIMIENTOS,
        select: {
          id: true,
          cuenta: { select: { id: true, nombre: true, moneda: true } },
          sentido: true,
          monto: true,
          origen: true,
          operacion: { select: { id: true, numeroComprobante: true } },
          trasladoId: true,
          revierteId: true,
          usuario: { select: { id: true, nombre: true } },
          creadoEn: true,
        },
      });
      return filas.map((fila) => ({
        ...fila,
        monto: montoATexto(fila.monto.toString(), fila.cuenta.moneda as Moneda),
      }));
    },
  };
}
