import { DECIMALES_TASA, montoATexto, sumar, type Moneda } from '@cambios-jc/shared';

import { entrarInventario, salirInventario } from '../../lib/inventario.js';
import { saldoDeCuenta } from '../../lib/libro.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type { DatosAjustarInventario } from './esquemas.js';

const MAXIMO_MOVIMIENTOS = 200;

export type ServicioInventario = ReturnType<typeof crearServicioInventario>;

export function crearServicioInventario({ prisma }: { prisma: PrismaClient }) {
  async function estado(moneda: Moneda) {
    const [fila, cuentas] = await Promise.all([
      prisma.inventarioDivisa.findUnique({ where: { moneda } }),
      prisma.cuentaDinero.findMany({ where: { moneda }, select: { id: true } }),
    ]);
    let saldo = sumar('0', '0');
    for (const cuenta of cuentas) saldo = sumar(saldo, await saldoDeCuenta(prisma, cuenta.id));
    return {
      moneda,
      cantidad: montoATexto(fila?.cantidad.toString() ?? '0', moneda),
      costoPromedio: fila?.costoPromedio?.toFixed(DECIMALES_TASA) ?? null,
      saldoCuentas: montoATexto(saldo, moneda),
      actualizadoEn: fila?.actualizadoEn ?? null,
    };
  }

  return {
    estado,

    /** Inventario de cada divisa que el negocio maneja (las que tienen cuentas o movimientos). */
    async listar() {
      const empresa = await prisma.empresa.findUnique({ where: { unica: true } });
      const local = empresa?.monedaLocal ?? 'COP';
      const [filas, cuentas] = await Promise.all([
        prisma.inventarioDivisa.findMany({ select: { moneda: true } }),
        prisma.cuentaDinero.findMany({ distinct: ['moneda'], select: { moneda: true } }),
      ]);
      const monedas = [...new Set([...filas, ...cuentas].map((f) => f.moneda))]
        .filter((m) => m !== local && (m === 'VES' || m === 'USD'))
        .sort();
      return Promise.all(monedas.map((m) => estado(m as Moneda)));
    },

    async movimientos(moneda: Moneda) {
      const filas = await prisma.movimientoInventario.findMany({
        where: { moneda },
        orderBy: { creadoEn: 'desc' },
        take: MAXIMO_MOVIMIENTOS,
        select: {
          id: true,
          origen: true,
          sentido: true,
          cantidad: true,
          tasa: true,
          cantidadDespues: true,
          costoDespues: true,
          compraId: true,
          operacion: { select: { id: true, numeroComprobante: true } },
          nota: true,
          usuario: { select: { id: true, nombre: true } },
          creadoEn: true,
        },
      });
      return filas.map((f) => ({
        ...f,
        cantidad: montoATexto(f.cantidad.toString(), moneda),
        tasa: f.tasa?.toFixed(DECIMALES_TASA) ?? null,
        cantidadDespues: montoATexto(f.cantidadDespues.toString(), moneda),
        costoDespues: f.costoDespues?.toFixed(DECIMALES_TASA) ?? null,
      }));
    },

    /**
     * Inventario inicial o corrección (D138): una entrada a una tasa dada (recalcula el costo) o una
     * salida al costo vigente. No mueve dinero de ninguna cuenta: corrige lo que el sistema cree que
     * costaron los bolívares. Solo el administrador, con motivo; el doble control llega en la fase 10.
     */
    async ajustar(
      moneda: Moneda,
      datos: DatosAjustarInventario,
      actor: { id: string },
      contexto: ContextoPeticion,
    ) {
      await prisma.$transaction(async (tx) => {
        if (datos.sentido === 'entrada' && datos.tasa) {
          await entrarInventario(tx, {
            moneda,
            cantidad: datos.cantidad,
            tasa: datos.tasa,
            origen: 'ajuste',
            nota: datos.motivo,
            usuarioId: actor.id,
          });
        } else {
          await salirInventario(tx, {
            moneda,
            cantidad: datos.cantidad,
            origen: 'ajuste',
            nota: datos.motivo,
            usuarioId: actor.id,
          });
        }
        await registrarAuditoria(tx, {
          usuarioId: actor.id,
          accion: 'inventario.ajustar',
          entidad: 'inventario',
          entidadId: moneda,
          ip: contexto.ip,
          agenteUsuario: contexto.agenteUsuario,
          despues: { ...datos, moneda },
        });
      });
      return estado(moneda);
    },
  };
}
