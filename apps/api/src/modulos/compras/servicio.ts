import {
  comparar,
  finDelDia,
  inicioDelDia,
  montoATexto,
  pesosDesdeDivisa,
  DECIMALES_TASA,
  type Moneda,
} from '@cambios-jc/shared';

import { Prisma } from '../../generated/prisma/client.js';
import { errores } from '../../lib/errores.js';
import { entrarInventario, revertirCompraEnInventario } from '../../lib/inventario.js';
import { registrarMovimiento } from '../../lib/libro.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';
import { saldosDeContrapartes } from '../contrapartes/servicio.js';

import type { CompraPublica, DatosRegistrarCompra } from './esquemas.js';

const MAXIMO_LISTA = 200;

const SELECCION = {
  id: true,
  contraparte: { select: { id: true, nombre: true } },
  moneda: true,
  cantidad: true,
  tasa: true,
  montoPesos: true,
  cuentaDestino: { select: { id: true, nombre: true } },
  formaPago: true,
  cuentaPago: { select: { id: true, nombre: true } },
  nota: true,
  creadoPor: { select: { id: true, nombre: true } },
  creadoEn: true,
  anuladoEn: true,
  anuladoPor: { select: { id: true, nombre: true } },
  motivoAnulacion: true,
  creadoPorId: true,
} satisfies Prisma.CompraDivisaSelect;

type FilaCompra = Prisma.CompraDivisaGetPayload<{ select: typeof SELECCION }>;

interface Actor {
  id: string;
}

export type ServicioCompras = ReturnType<typeof crearServicioCompras>;

function aPublica(fila: FilaCompra): CompraPublica {
  return {
    id: fila.id,
    contraparte: fila.contraparte,
    moneda: fila.moneda,
    cantidad: montoATexto(fila.cantidad.toString(), fila.moneda as Moneda),
    tasa: fila.tasa.toFixed(DECIMALES_TASA),
    montoPesos: fila.montoPesos.toFixed(2),
    cuentaDestino: fila.cuentaDestino,
    formaPago: fila.formaPago,
    cuentaPago: fila.cuentaPago,
    nota: fila.nota,
    creadoPor: fila.creadoPor,
    creadoEn: fila.creadoEn,
    anulado:
      fila.anuladoEn && fila.anuladoPor && fila.motivoAnulacion
        ? { por: fila.anuladoPor, en: fila.anuladoEn, motivo: fila.motivoAnulacion }
        : null,
  };
}

async function monedaLocalDe(prisma: PrismaClient): Promise<Moneda> {
  const empresa = await prisma.empresa.findUnique({ where: { unica: true } });
  return (empresa?.monedaLocal ?? 'COP') as Moneda;
}

export function crearServicioCompras({ prisma }: { prisma: PrismaClient }) {
  async function cargar(id: string): Promise<CompraPublica> {
    const fila = await prisma.compraDivisa.findUnique({ where: { id }, select: SELECCION });
    if (!fila) throw errores.noEncontrado('La compra no existe.');
    return aPublica(fila);
  }

  return {
    obtener: cargar,

    async opciones() {
      const monedaLocal = await monedaLocalDe(prisma);
      const [contrapartes, cuentas] = await Promise.all([
        prisma.contraparte.findMany({
          where: { activa: true },
          orderBy: { nombre: 'asc' },
          select: { id: true, nombre: true },
        }),
        prisma.cuentaDinero.findMany({
          where: { activa: true },
          orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
          select: { id: true, nombre: true, moneda: true, contraparteTitularId: true },
        }),
      ]);
      const saldos = await saldosDeContrapartes(
        prisma,
        contrapartes.map((c) => c.id),
      );
      return {
        monedaLocal,
        contrapartes: contrapartes.map((c) => ({
          ...c,
          saldoLocal:
            saldos.get(c.id)?.find((s) => s.moneda === monedaLocal)?.saldo ??
            montoATexto('0', monedaLocal),
        })),
        cuentasDestino: cuentas.filter((c) => c.moneda !== monedaLocal),
        cuentasPago: cuentas
          .filter((c) => c.moneda === monedaLocal)
          .map(({ id, nombre, moneda }) => ({ id, nombre, moneda })),
      };
    },

    async listar(filtro: {
      contraparteId?: string | undefined;
      desde?: string | undefined;
      hasta?: string | undefined;
    }): Promise<CompraPublica[]> {
      const empresa = await prisma.empresa.findUnique({ where: { unica: true } });
      const zona = empresa?.zonaHoraria ?? 'America/Bogota';
      const filas = await prisma.compraDivisa.findMany({
        where: {
          ...(filtro.contraparteId ? { contraparteId: filtro.contraparteId } : {}),
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
        take: MAXIMO_LISTA,
        select: SELECCION,
      });
      return filas.map(aPublica);
    },

    /**
     * Compra de divisa a una contraparte (§5.6, D139): la divisa entra a la cuenta de destino, el pago
     * sale de una cuenta en pesos (de contado) o queda como deuda en la cuenta corriente (a crédito;
     * si había un anticipo, lo descuenta: eso es un fondeo), y el inventario recalcula su costo
     * promedio. Todo en una transacción.
     */
    async registrar(
      datos: DatosRegistrarCompra,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<{ compra: CompraPublica; repetido: boolean }> {
      const previo = await prisma.compraDivisa.findUnique({
        where: { claveIdempotencia: datos.claveIdempotencia },
        select: SELECCION,
      });
      if (previo) return repetido(previo, actor);

      const monedaLocal = await monedaLocalDe(prisma);
      const [contraparte, destino, pago, turno] = await Promise.all([
        prisma.contraparte.findUnique({ where: { id: datos.contraparteId } }),
        prisma.cuentaDinero.findUnique({ where: { id: datos.cuentaDestinoId } }),
        datos.cuentaPagoId
          ? prisma.cuentaDinero.findUnique({ where: { id: datos.cuentaPagoId } })
          : null,
        prisma.turno.findUnique({ where: { usuarioEnUso: actor.id }, select: { id: true } }),
      ]);
      if (!contraparte?.activa) {
        throw errores.estadoInvalido('La contraparte no existe o está desactivada.');
      }
      if (!destino?.activa) {
        throw errores.estadoInvalido('La cuenta de destino no existe o está desactivada.');
      }
      if (destino.moneda === monedaLocal) {
        throw errores.estadoInvalido(
          `La cuenta de destino debe ser de la divisa comprada, no en ${monedaLocal}.`,
        );
      }
      if (datos.formaPago === 'contado') {
        if (!pago?.activa) {
          throw errores.estadoInvalido('La cuenta de pago no existe o está desactivada.');
        }
        if (pago.moneda !== monedaLocal) {
          throw errores.estadoInvalido(
            `El pago de una compra sale de una cuenta en ${monedaLocal}.`,
          );
        }
      }
      const moneda = destino.moneda as Moneda;
      const cantidad = montoATexto(datos.cantidad, moneda);
      if (comparar(cantidad, datos.cantidad) !== 0) {
        throw errores.estadoInvalido(`Los montos en ${moneda} no admiten ese número de decimales.`);
      }
      const montoPesos = montoATexto(pesosDesdeDivisa(cantidad, datos.tasa), monedaLocal);
      if (comparar(montoPesos, '0') <= 0) {
        throw errores.estadoInvalido('La compra vale cero pesos: revisa la cantidad y la tasa.');
      }
      const nota = datos.nota?.trim() ? datos.nota.trim() : null;

      const crear = () =>
        prisma.$transaction(async (tx) => {
          const compra = await tx.compraDivisa.create({
            data: {
              contraparteId: contraparte.id,
              moneda,
              cantidad,
              tasa: datos.tasa,
              montoPesos,
              cuentaDestinoId: destino.id,
              formaPago: datos.formaPago,
              cuentaPagoId: pago?.id ?? null,
              nota,
              turnoId: turno?.id ?? null,
              claveIdempotencia: datos.claveIdempotencia,
              creadoPorId: actor.id,
            },
            select: { id: true },
          });
          const comunes = { compraId: compra.id, turnoId: turno?.id ?? null, usuarioId: actor.id };
          await registrarMovimiento(tx, {
            ...comunes,
            cuentaId: destino.id,
            sentido: 'entrada',
            monto: cantidad,
            moneda,
            origen: 'compra_ingreso',
          });
          if (pago) {
            await registrarMovimiento(tx, {
              ...comunes,
              cuentaId: pago.id,
              sentido: 'salida',
              monto: montoPesos,
              moneda: monedaLocal,
              origen: 'compra_pago',
            });
          } else {
            const deuda = await tx.movimientoContraparte.create({
              data: {
                contraparteId: contraparte.id,
                tipo: 'compra_credito',
                moneda: monedaLocal,
                monto: montoPesos,
                signo: -1,
                nota: `Compra de ${cantidad} ${moneda} a ${datos.tasa}`,
                turnoId: turno?.id ?? null,
                claveIdempotencia: `compra:${compra.id}`,
                usuarioId: actor.id,
              },
              select: { id: true },
            });
            await tx.compraDivisa.update({
              where: { id: compra.id },
              data: { movimientoContraparteId: deuda.id },
            });
          }
          await entrarInventario(tx, {
            moneda,
            cantidad,
            tasa: datos.tasa,
            origen: 'compra',
            compraId: compra.id,
            usuarioId: actor.id,
          });
          await registrarAuditoria(tx, {
            usuarioId: actor.id,
            accion: 'compra.registrar',
            entidad: 'compra',
            entidadId: compra.id,
            ip: contexto.ip,
            agenteUsuario: contexto.agenteUsuario,
            despues: {
              contraparte: contraparte.nombre,
              moneda,
              cantidad,
              tasa: datos.tasa,
              montoPesos,
              formaPago: datos.formaPago,
              destino: destino.nombre,
              pago: pago?.nombre ?? null,
            },
          });
          return compra.id;
        });

      try {
        return { compra: await cargar(await crear()), repetido: false };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const ganador = await prisma.compraDivisa.findUnique({
            where: { claveIdempotencia: datos.claveIdempotencia },
            select: SELECCION,
          });
          if (ganador) return repetido(ganador, actor);
        }
        throw error;
      }
    },

    /**
     * Anula una compra: la divisa sale de la cuenta de destino, el pago vuelve a su cuenta o la deuda
     * se anula en la cuenta corriente, y el inventario deshace la entrada (D139). Siempre con motivo.
     */
    async anular(
      id: string,
      motivo: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<CompraPublica> {
      const monedaLocal = await monedaLocalDe(prisma);
      await prisma.$transaction(async (tx) => {
        const compra = await tx.compraDivisa.findUnique({
          where: { id },
          include: { contraparte: { select: { nombre: true } } },
        });
        if (!compra) throw errores.noEncontrado('La compra no existe.');
        const cambio = await tx.compraDivisa.updateMany({
          where: { id, anuladoEn: null },
          data: { anuladoEn: new Date(), anuladoPorId: actor.id, motivoAnulacion: motivo },
        });
        if (cambio.count === 0) throw errores.estadoInvalido('Esa compra ya fue anulada.');

        const turno = await tx.turno.findUnique({
          where: { usuarioEnUso: actor.id },
          select: { id: true },
        });
        const originales = await tx.movimientoCuenta.findMany({
          where: { compraId: id, revierteId: null },
          include: { cuenta: { select: { moneda: true } } },
        });
        for (const original of originales) {
          await registrarMovimiento(tx, {
            cuentaId: original.cuentaId,
            sentido: original.sentido === 'entrada' ? 'salida' : 'entrada',
            monto: original.monto.toString(),
            moneda: original.cuenta.moneda as Moneda,
            origen: 'compra_anulacion',
            compraId: id,
            revierteId: original.id,
            turnoId: turno?.id ?? null,
            usuarioId: actor.id,
          });
        }
        if (compra.movimientoContraparteId) {
          await tx.movimientoContraparte.create({
            data: {
              contraparteId: compra.contraparteId,
              tipo: 'compra_credito',
              moneda: monedaLocal,
              monto: compra.montoPesos,
              signo: 1,
              nota: motivo,
              revierteId: compra.movimientoContraparteId,
              turnoId: turno?.id ?? null,
              claveIdempotencia: `anulacion:${compra.movimientoContraparteId}`,
              usuarioId: actor.id,
            },
          });
        }
        await revertirCompraEnInventario(tx, {
          moneda: compra.moneda as Moneda,
          cantidad: compra.cantidad.toString(),
          tasa: compra.tasa.toString(),
          compraId: id,
          nota: motivo,
          usuarioId: actor.id,
        });
        await registrarAuditoria(tx, {
          usuarioId: actor.id,
          accion: 'compra.anular',
          entidad: 'compra',
          entidadId: id,
          ip: contexto.ip,
          agenteUsuario: contexto.agenteUsuario,
          despues: { contraparte: compra.contraparte.nombre, motivo },
        });
      });
      return cargar(id);
    },
  };
}

function repetido(fila: FilaCompra, actor: Actor): { compra: CompraPublica; repetido: true } {
  if (fila.creadoPorId !== actor.id) {
    throw errores.estadoInvalido('Esa clave de operación ya fue usada. Recarga la pantalla.');
  }
  return { compra: aPublica(fila), repetido: true };
}
