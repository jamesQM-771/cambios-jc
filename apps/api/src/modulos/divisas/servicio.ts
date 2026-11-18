import {
  comparar,
  DECIMALES_TASA,
  finDelDia,
  gananciaDeVentaDivisa,
  inicioDelDia,
  montoATexto,
  pesosDesdeDivisa,
  totalDeDenominaciones,
  type Moneda,
} from '@cambios-jc/shared';

import { Prisma } from '../../generated/prisma/client.js';
import { errores } from '../../lib/errores.js';
import {
  entrarInventario,
  revertirCompraEnInventario,
  salirInventario,
} from '../../lib/inventario.js';
import { registrarMovimiento } from '../../lib/libro.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type { DatosRegistrarDivisa, DivisaPublica } from './esquemas.js';

const MAXIMO_LISTA = 200;

const SELECCION = {
  id: true,
  numeroComprobante: true,
  tipo: true,
  lineaNegocio: { select: { id: true, nombre: true } },
  moneda: true,
  montoDivisa: true,
  montoPesos: true,
  tasaCalculada: true,
  tasaUsada: true,
  motivoTasa: true,
  clienteNombre: true,
  clienteDocumento: true,
  turno: { select: { id: true, caja: { select: { id: true, nombre: true } } } },
  denominaciones: {
    select: { sentido: true, moneda: true, valor: true, cantidad: true },
    orderBy: { valor: 'desc' },
  },
  costoPromedio: true,
  ganancia: true,
  impresiones: true,
  creadoPorId: true,
  creadoPor: { select: { id: true, nombre: true } },
  creadoEn: true,
  anuladoEn: true,
  anuladoPor: { select: { id: true, nombre: true } },
  motivoAnulacion: true,
} satisfies Prisma.OperacionDivisaSelect;

type FilaDivisa = Prisma.OperacionDivisaGetPayload<{ select: typeof SELECCION }>;

interface Actor {
  id: string;
}

/** Lo que puede hacer y ver quien pide (sale de sus permisos). */
export interface Alcance {
  verGanancia: boolean;
  verTodas: boolean;
  cambiarTasa: boolean;
}

export type ServicioDivisas = ReturnType<typeof crearServicioDivisas>;

function aPublica(fila: FilaDivisa, verGanancia: boolean): DivisaPublica {
  return {
    id: fila.id,
    numeroComprobante: fila.numeroComprobante,
    tipo: fila.tipo,
    lineaNegocio: fila.lineaNegocio,
    moneda: fila.moneda,
    montoDivisa: fila.montoDivisa.toFixed(2),
    montoPesos: fila.montoPesos.toFixed(2),
    tasaCalculada: fila.tasaCalculada.toFixed(DECIMALES_TASA),
    tasaUsada: fila.tasaUsada.toFixed(DECIMALES_TASA),
    motivoTasa: fila.motivoTasa,
    clienteNombre: fila.clienteNombre,
    clienteDocumento: fila.clienteDocumento,
    turno: fila.turno,
    billetes: fila.denominaciones.map((d) => ({
      sentido: d.sentido,
      moneda: d.moneda,
      valor: montoATexto(d.valor.toString(), d.moneda as Moneda),
      cantidad: d.cantidad,
    })),
    ganancia:
      verGanancia && fila.costoPromedio && fila.ganancia
        ? {
            costoPromedio: fila.costoPromedio.toFixed(DECIMALES_TASA),
            ganancia: fila.ganancia.toFixed(2),
          }
        : null,
    creadoPor: fila.creadoPor,
    creadoEn: fila.creadoEn,
    anulado:
      fila.anuladoEn && fila.anuladoPor && fila.motivoAnulacion
        ? { por: fila.anuladoPor, en: fila.anuladoEn, motivo: fila.motivoAnulacion }
        : null,
  };
}

export function crearServicioDivisas({ prisma }: { prisma: PrismaClient }) {
  async function cargarFila(id: string): Promise<FilaDivisa> {
    const fila = await prisma.operacionDivisa.findUnique({ where: { id }, select: SELECCION });
    if (!fila) throw errores.noEncontrado('La operación no existe.');
    return fila;
  }

  /** Quien no ve todas solo puede consultar las que registró. */
  function exigirAlcance(fila: FilaDivisa, actor: Actor, alcance: Alcance): void {
    if (!alcance.verTodas && fila.creadoPorId !== actor.id) {
      throw errores.noEncontrado('La operación no existe.');
    }
  }

  async function monedaLocal(): Promise<Moneda> {
    const empresa = await prisma.empresa.findUnique({ where: { unica: true } });
    return (empresa?.monedaLocal ?? 'COP') as Moneda;
  }

  return {
    async opciones(actor: Actor, alcance: Alcance) {
      const local = await monedaLocal();
      const [lineas, turno] = await Promise.all([
        prisma.lineaNegocio.findMany({
          where: { clase: 'divisa_caja', activa: true },
          orderBy: { nombre: 'asc' },
          include: { tasas: { where: { vigenteHasta: null }, take: 1 } },
        }),
        prisma.turno.findUnique({
          where: { usuarioEnUso: actor.id },
          select: {
            id: true,
            caja: {
              select: {
                id: true,
                nombre: true,
                cuentas: { where: { activa: true, tipo: 'caja' }, select: { moneda: true } },
              },
            },
          },
        }),
      ]);
      const monedas = [...new Set(lineas.map((l) => l.monedaOrigen))];
      const denominaciones = await prisma.denominacion.findMany({
        where: { activa: true, moneda: { in: monedas } },
        orderBy: { valor: 'desc' },
        select: { id: true, moneda: true, valor: true },
      });
      return {
        lineas: lineas.map((linea) => {
          const tasa = linea.tasas[0];
          return {
            id: linea.id,
            nombre: linea.nombre,
            moneda: linea.monedaOrigen,
            monedaLocal: local,
            tasaCompra: tasa?.tasaCompra?.toFixed(DECIMALES_TASA) ?? null,
            tasaVenta: tasa ? tasa.tasaVenta.toFixed(DECIMALES_TASA) : null,
            denominaciones: denominaciones
              .filter((d) => d.moneda === linea.monedaOrigen)
              .map((d) => ({
                id: d.id,
                valor: montoATexto(d.valor.toString(), d.moneda as Moneda),
              })),
          };
        }),
        miTurno: turno
          ? {
              id: turno.id,
              caja: { id: turno.caja.id, nombre: turno.caja.nombre },
              monedas: [...new Set(turno.caja.cuentas.map((c) => c.moneda))].sort(),
            }
          : null,
        puedeCambiarTasa: alcance.cambiarTasa,
      };
    },

    async listar(
      filtro: { desde?: string | undefined; hasta?: string | undefined },
      actor: Actor,
      alcance: Alcance,
    ): Promise<DivisaPublica[]> {
      const empresa = await prisma.empresa.findUnique({ where: { unica: true } });
      const zona = empresa?.zonaHoraria ?? 'America/Bogota';
      const filas = await prisma.operacionDivisa.findMany({
        where: {
          ...(alcance.verTodas ? {} : { creadoPorId: actor.id }),
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
      return filas.map((fila) => aPublica(fila, alcance.verGanancia));
    },

    async obtener(id: string, actor: Actor, alcance: Alcance): Promise<DivisaPublica> {
      const fila = await cargarFila(id);
      exigirAlcance(fila, actor, alcance);
      return aPublica(fila, alcance.verGanancia);
    },

    /**
     * Compra o venta de divisa en efectivo (§5.7, D145): dentro del turno de quien la registra, con
     * los billetes de la divisa contados uno a uno. En una transacción: la divisa y los pesos entran
     * o salen de las cuentas de efectivo de la caja del turno, el inventario de la divisa recalcula
     * su costo (compra) o la divisa sale al costo vigente y queda fijada la ganancia (venta, D146).
     */
    async registrar(
      datos: DatosRegistrarDivisa,
      actor: Actor,
      alcance: Alcance,
      contexto: ContextoPeticion,
    ): Promise<{ operacion: DivisaPublica; repetido: boolean }> {
      const previo = await prisma.operacionDivisa.findUnique({
        where: { claveIdempotencia: datos.claveIdempotencia },
        select: SELECCION,
      });
      if (previo) {
        if (previo.creadoPorId !== actor.id) {
          throw errores.estadoInvalido('Esa clave de operación ya fue usada. Recarga la pantalla.');
        }
        return { operacion: aPublica(previo, alcance.verGanancia), repetido: true };
      }
      if (datos.tasaManual && !alcance.cambiarTasa) throw errores.sinPermiso();

      const turno = await prisma.turno.findUnique({
        where: { usuarioEnUso: actor.id },
        select: { id: true, cajaId: true },
      });
      if (!turno)
        throw errores.estadoInvalido('Abre tu turno de caja antes de comprar o vender divisas.');

      const linea = await prisma.lineaNegocio.findUnique({
        where: { id: datos.lineaNegocioId },
        include: { tasas: { where: { vigenteHasta: null }, take: 1 } },
      });
      if (linea?.clase !== 'divisa_caja' || !linea.activa) {
        throw errores.estadoInvalido(
          'La línea no existe, está desactivada o no es de divisas en caja.',
        );
      }
      const moneda = linea.monedaOrigen as Moneda;
      const local = linea.monedaDestino as Moneda;
      const tasaVigente = linea.tasas[0];
      if (!tasaVigente)
        throw errores.estadoInvalido(
          'No hay una tasa vigente para esta línea: publica una primero.',
        );
      const tasaCalculada =
        datos.tipo === 'compra' ? tasaVigente.tasaCompra : tasaVigente.tasaVenta;
      if (!tasaCalculada) {
        throw errores.estadoInvalido(
          'La tasa vigente no tiene tasa de compra: publícala para poder comprar.',
        );
      }
      const tasaUsada = datos.tasaManual?.tasa ?? tasaCalculada.toString();

      const [cuentaDivisa, cuentaPesos] = await Promise.all([
        prisma.cuentaDinero.findFirst({
          where: { cajaId: turno.cajaId, tipo: 'caja', activa: true, moneda },
        }),
        prisma.cuentaDinero.findFirst({
          where: { cajaId: turno.cajaId, tipo: 'caja', activa: true, moneda: local },
        }),
      ]);
      if (!cuentaDivisa || !cuentaPesos) {
        throw errores.estadoInvalido(
          `La caja de tu turno necesita una cuenta de efectivo en ${moneda} y otra en ${local}.`,
        );
      }

      // Los billetes: de la moneda de la línea, activos, sin repetir, y que sumen el monto exacto.
      const ids = datos.billetes.map((b) => b.denominacionId);
      if (new Set(ids).size !== ids.length) {
        throw errores.estadoInvalido('Cada billete va una sola vez, con su cantidad.');
      }
      const denominaciones = await prisma.denominacion.findMany({
        where: { id: { in: ids }, activa: true, moneda },
      });
      if (denominaciones.length !== ids.length) {
        throw errores.estadoInvalido(`Usa solo billetes activos en ${moneda}.`);
      }
      const billetes = datos.billetes.map((b) => {
        const denominacion = denominaciones.find((d) => d.id === b.denominacionId);
        if (!denominacion) throw errores.estadoInvalido(`Usa solo billetes activos en ${moneda}.`);
        return { ...b, valor: denominacion.valor.toString() };
      });
      const monto = montoATexto(datos.montoDivisa, moneda);
      if (comparar(totalDeDenominaciones(billetes), monto) !== 0) {
        throw errores.estadoInvalido(
          `Los billetes suman ${montoATexto(totalDeDenominaciones(billetes), moneda)} ${moneda} y el monto es ${monto}: deben coincidir.`,
        );
      }
      const montoPesos = montoATexto(pesosDesdeDivisa(monto, tasaUsada), local);
      const entra = datos.tipo === 'compra';

      const crear = () =>
        prisma.$transaction(async (tx) => {
          const filas = await tx.$queryRaw<{ valor: number }[]>`
            UPDATE "contador" SET "valor" = "valor" + 1 WHERE "clave" = 'comprobante' RETURNING "valor"`;
          const numero = filas[0]?.valor;
          if (numero === undefined) throw new Error('Falta el contador de comprobantes.');
          const creada = await tx.operacionDivisa.create({
            data: {
              numeroComprobante: numero,
              tipo: datos.tipo,
              lineaNegocioId: linea.id,
              tasaId: tasaVigente.id,
              moneda,
              montoDivisa: monto,
              montoPesos,
              tasaCalculada: tasaCalculada.toString(),
              tasaUsada,
              motivoTasa: datos.tasaManual?.motivo ?? null,
              clienteNombre: datos.clienteNombre?.trim() || null,
              clienteDocumento: datos.clienteDocumento?.trim() || null,
              turnoId: turno.id,
              cuentaDivisaId: cuentaDivisa.id,
              cuentaPesosId: cuentaPesos.id,
              claveIdempotencia: datos.claveIdempotencia,
              creadoPorId: actor.id,
              denominaciones: {
                create: billetes.map((b) => ({
                  sentido: entra ? ('entrada' as const) : ('salida' as const),
                  moneda,
                  denominacionId: b.denominacionId,
                  valor: b.valor,
                  cantidad: b.cantidad,
                })),
              },
            },
            select: { id: true },
          });
          const comunes = { operacionDivisaId: creada.id, turnoId: turno.id, usuarioId: actor.id };
          await registrarMovimiento(tx, {
            ...comunes,
            cuentaId: cuentaDivisa.id,
            sentido: entra ? 'entrada' : 'salida',
            monto,
            moneda,
            origen: entra ? 'divisa_entrada' : 'divisa_salida',
          });
          await registrarMovimiento(tx, {
            ...comunes,
            cuentaId: cuentaPesos.id,
            sentido: entra ? 'salida' : 'entrada',
            monto: montoPesos,
            moneda: local,
            origen: entra ? 'divisa_salida' : 'divisa_entrada',
          });
          if (entra) {
            await entrarInventario(tx, {
              moneda,
              cantidad: monto,
              tasa: tasaUsada,
              origen: 'divisa_compra',
              operacionDivisaId: creada.id,
              usuarioId: actor.id,
            });
          } else {
            const costo = await salirInventario(tx, {
              moneda,
              cantidad: monto,
              origen: 'divisa_venta',
              operacionDivisaId: creada.id,
              usuarioId: actor.id,
            });
            if (costo) {
              await tx.operacionDivisa.update({
                where: { id: creada.id },
                data: {
                  costoPromedio: costo.toString(),
                  ganancia: gananciaDeVentaDivisa({
                    montoDivisa: monto,
                    tasaUsada,
                    costoPromedio: costo,
                  }).toString(),
                },
              });
            }
          }
          await registrarAuditoria(tx, {
            usuarioId: actor.id,
            accion: `divisa.${datos.tipo}`,
            entidad: 'operacion_divisa',
            entidadId: creada.id,
            ip: contexto.ip,
            agenteUsuario: contexto.agenteUsuario,
            despues: {
              numeroComprobante: numero,
              moneda,
              montoDivisa: monto,
              montoPesos,
              tasaUsada,
              motivoTasa: datos.tasaManual?.motivo ?? null,
            },
          });
          return creada.id;
        });

      try {
        const id = await crear();
        return { operacion: aPublica(await cargarFila(id), alcance.verGanancia), repetido: false };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const ganador = await prisma.operacionDivisa.findUnique({
            where: { claveIdempotencia: datos.claveIdempotencia },
            select: SELECCION,
          });
          if (ganador?.creadoPorId === actor.id) {
            return { operacion: aPublica(ganador, alcance.verGanancia), repetido: true };
          }
        }
        throw error;
      }
    },

    /** Anula: el dinero vuelve por las mismas cuentas y el inventario se deshace (D147). */
    async anular(
      id: string,
      motivo: string,
      actor: Actor,
      alcance: Alcance,
      contexto: ContextoPeticion,
    ): Promise<DivisaPublica> {
      await prisma.$transaction(async (tx) => {
        const operacion = await tx.operacionDivisa.findUnique({ where: { id } });
        if (!operacion) throw errores.noEncontrado('La operación no existe.');
        const cambio = await tx.operacionDivisa.updateMany({
          where: { id, anuladoEn: null },
          data: { anuladoEn: new Date(), anuladoPorId: actor.id, motivoAnulacion: motivo },
        });
        if (cambio.count === 0) throw errores.estadoInvalido('Esa operación ya fue anulada.');
        const turno = await tx.turno.findUnique({
          where: { usuarioEnUso: actor.id },
          select: { id: true },
        });
        const originales = await tx.movimientoCuenta.findMany({
          where: { operacionDivisaId: id, revierteId: null },
          include: { cuenta: { select: { moneda: true } } },
        });
        for (const original of originales) {
          await registrarMovimiento(tx, {
            cuentaId: original.cuentaId,
            sentido: original.sentido === 'entrada' ? 'salida' : 'entrada',
            monto: original.monto.toString(),
            moneda: original.cuenta.moneda as Moneda,
            origen: 'divisa_anulacion',
            operacionDivisaId: id,
            revierteId: original.id,
            turnoId: turno?.id ?? null,
            usuarioId: actor.id,
          });
        }
        const moneda = operacion.moneda as Moneda;
        if (operacion.tipo === 'compra') {
          await revertirCompraEnInventario(tx, {
            moneda,
            cantidad: operacion.montoDivisa.toString(),
            tasa: operacion.tasaUsada.toString(),
            origen: 'divisa_anulacion',
            operacionDivisaId: id,
            nota: motivo,
            usuarioId: actor.id,
          });
        } else if (operacion.costoPromedio) {
          // La divisa vendida vuelve al inventario al mismo costo con que salió.
          await entrarInventario(tx, {
            moneda,
            cantidad: operacion.montoDivisa.toString(),
            tasa: operacion.costoPromedio.toString(),
            origen: 'divisa_anulacion',
            operacionDivisaId: id,
            nota: motivo,
            usuarioId: actor.id,
          });
        }
        await registrarAuditoria(tx, {
          usuarioId: actor.id,
          accion: 'divisa.anular',
          entidad: 'operacion_divisa',
          entidadId: id,
          ip: contexto.ip,
          agenteUsuario: contexto.agenteUsuario,
          despues: { numeroComprobante: operacion.numeroComprobante, motivo },
        });
      });
      return aPublica(await cargarFila(id), alcance.verGanancia);
    },

    /** Recibo en ticket: la primera impresión es el original; las siguientes salen como COPIA. */
    async imprimir(id: string, actor: Actor, alcance: Alcance) {
      const fila = await cargarFila(id);
      exigirAlcance(fila, actor, alcance);
      const actualizada = await prisma.operacionDivisa.update({
        where: { id },
        data: { impresiones: { increment: 1 } },
        select: { impresiones: true },
      });
      const empresa = await prisma.empresa.findUnique({ where: { unica: true } });
      return {
        esCopia: actualizada.impresiones > 1,
        operacion: aPublica(fila, false),
        empresa: {
          nombre: empresa?.nombre ?? '',
          nit: empresa?.nit ?? null,
          whatsapp: empresa?.whatsapp ?? null,
          textoPie: empresa?.textoPieRecibo ?? null,
          zonaHoraria: empresa?.zonaHoraria ?? 'America/Bogota',
        },
      };
    },
  };
}
