import { comparar, finDelDia, inicioDelDia, montoATexto, type Moneda } from '@cambios-jc/shared';

import { Prisma } from '../../generated/prisma/client.js';
import { errores } from '../../lib/errores.js';
import { registrarMovimiento } from '../../lib/libro.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type { DatosRegistrarTraslado, TrasladoPublico } from './esquemas.js';

const MAXIMO_LISTA = 100;

const SELECCION = {
  id: true,
  origen: { select: { id: true, nombre: true, moneda: true } },
  destino: { select: { id: true, nombre: true, moneda: true } },
  monto: true,
  nota: true,
  turno: { select: { id: true, caja: { select: { id: true, nombre: true } } } },
  creadoPor: { select: { id: true, nombre: true } },
  creadoEn: true,
  anuladoEn: true,
  anuladoPor: { select: { id: true, nombre: true } },
  motivoAnulacion: true,
} satisfies Prisma.TrasladoSelect;

type FilaTraslado = Prisma.TrasladoGetPayload<{ select: typeof SELECCION }>;

interface Actor {
  id: string;
}

export type ServicioTraslados = ReturnType<typeof crearServicioTraslados>;

function aPublico(fila: FilaTraslado): TrasladoPublico {
  return {
    id: fila.id,
    origen: fila.origen,
    destino: fila.destino,
    monto: montoATexto(fila.monto.toString(), fila.origen.moneda as Moneda),
    nota: fila.nota,
    turno: fila.turno,
    creadoPor: fila.creadoPor,
    creadoEn: fila.creadoEn,
    anulado:
      fila.anuladoEn && fila.anuladoPor && fila.motivoAnulacion
        ? { por: fila.anuladoPor, en: fila.anuladoEn, motivo: fila.motivoAnulacion }
        : null,
  };
}

export function crearServicioTraslados({ prisma }: { prisma: PrismaClient }) {
  async function cargar(id: string): Promise<TrasladoPublico> {
    const fila = await prisma.traslado.findUnique({ where: { id }, select: SELECCION });
    if (!fila) throw errores.noEncontrado('El traslado no existe.');
    return aPublico(fila);
  }

  return {
    obtener: cargar,

    async opciones(actor: Actor, puedeCualquierCuenta: boolean) {
      const [cuentas, miTurno] = await Promise.all([
        prisma.cuentaDinero.findMany({
          where: { activa: true },
          orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
          select: { id: true, nombre: true, tipo: true, moneda: true, cajaId: true },
        }),
        prisma.turno.findUnique({
          where: { usuarioEnUso: actor.id },
          select: { id: true, caja: { select: { id: true, nombre: true } } },
        }),
      ]);
      return { cuentas, miTurno, puedeCualquierCuenta };
    },

    async listar(filtro: {
      cuentaId?: string | undefined;
      desde?: string | undefined;
      hasta?: string | undefined;
    }): Promise<TrasladoPublico[]> {
      const empresa = await prisma.empresa.findUnique({ where: { unica: true } });
      const zona = empresa?.zonaHoraria ?? 'America/Bogota';
      const filas = await prisma.traslado.findMany({
        where: {
          ...(filtro.cuentaId
            ? { OR: [{ origenId: filtro.cuentaId }, { destinoId: filtro.cuentaId }] }
            : {}),
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
      return filas.map(aPublico);
    },

    /**
     * Pasa dinero de una cuenta a otra de la misma moneda: una salida y una entrada en el libro, en
     * una sola transacción (D124). Quien no es administrador necesita su turno abierto y una de las
     * dos cuentas tiene que ser la de su caja: no mueve dinero que no tiene en las manos.
     */
    async registrar(
      datos: DatosRegistrarTraslado,
      actor: Actor,
      puedeCualquierCuenta: boolean,
      contexto: ContextoPeticion,
    ): Promise<{ traslado: TrasladoPublico; repetido: boolean }> {
      const previo = await prisma.traslado.findUnique({
        where: { claveIdempotencia: datos.claveIdempotencia },
        select: { ...SELECCION, creadoPorId: true },
      });
      if (previo) return repetido(previo, actor);

      const [origen, destino, turno] = await Promise.all([
        prisma.cuentaDinero.findUnique({ where: { id: datos.origenId } }),
        prisma.cuentaDinero.findUnique({ where: { id: datos.destinoId } }),
        prisma.turno.findUnique({
          where: { usuarioEnUso: actor.id },
          select: { id: true, cajaId: true },
        }),
      ]);
      if (!origen?.activa)
        throw errores.estadoInvalido('La cuenta de origen no existe o está desactivada.');
      if (!destino?.activa)
        throw errores.estadoInvalido('La cuenta de destino no existe o está desactivada.');
      if (origen.moneda !== destino.moneda) {
        throw errores.estadoInvalido(
          `Un traslado no cambia de moneda: el origen es en ${origen.moneda} y el destino en ${destino.moneda}.`,
        );
      }
      const moneda = origen.moneda as Moneda;
      // Nunca se redondea en silencio: si el monto trae más decimales de los que admite la moneda, se rechaza.
      const monto = montoATexto(datos.monto, moneda);
      if (comparar(monto, datos.monto) !== 0) {
        throw errores.estadoInvalido(`Los montos en ${moneda} no admiten ese número de decimales.`);
      }

      if (!puedeCualquierCuenta) {
        if (!turno)
          throw errores.estadoInvalido('Abre tu turno de caja antes de hacer un traslado.');
        const esDeMiCaja = (cuenta: { tipo: string; cajaId: string | null }) =>
          cuenta.tipo === 'caja' && cuenta.cajaId === turno.cajaId;
        if (!esDeMiCaja(origen) && !esDeMiCaja(destino)) {
          throw errores.estadoInvalido(
            'Solo puedes trasladar desde o hacia la caja de tu turno. Pídele al administrador los demás traslados.',
          );
        }
      }

      const crear = () =>
        prisma.$transaction(async (tx) => {
          const creado = await tx.traslado.create({
            data: {
              origenId: origen.id,
              destinoId: destino.id,
              monto,
              nota: datos.nota ?? null,
              turnoId: turno?.id ?? null,
              claveIdempotencia: datos.claveIdempotencia,
              creadoPorId: actor.id,
            },
            select: { id: true },
          });
          const comunes = {
            moneda,
            trasladoId: creado.id,
            turnoId: turno?.id ?? null,
            usuarioId: actor.id,
          };
          await registrarMovimiento(tx, {
            ...comunes,
            cuentaId: origen.id,
            sentido: 'salida',
            monto,
            origen: 'traslado_salida',
          });
          await registrarMovimiento(tx, {
            ...comunes,
            cuentaId: destino.id,
            sentido: 'entrada',
            monto,
            origen: 'traslado_entrada',
          });
          await registrarAuditoria(tx, {
            usuarioId: actor.id,
            accion: 'traslado.registrar',
            entidad: 'traslado',
            entidadId: creado.id,
            ip: contexto.ip,
            agenteUsuario: contexto.agenteUsuario,
            despues: { origen: origen.nombre, destino: destino.nombre, moneda, monto },
          });
          return creado.id;
        });

      try {
        return { traslado: await cargar(await crear()), repetido: false };
      } catch (error) {
        // Dos peticiones con la misma clave a la vez: gana una y la otra devuelve ese mismo traslado.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const ganador = await prisma.traslado.findUnique({
            where: { claveIdempotencia: datos.claveIdempotencia },
            select: { ...SELECCION, creadoPorId: true },
          });
          if (ganador) return repetido(ganador, actor);
        }
        throw error;
      }
    },

    /** Deshace un traslado con dos movimientos contrarios. Solo el administrador, siempre con motivo. */
    async anular(
      id: string,
      motivo: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<TrasladoPublico> {
      await prisma.$transaction(async (tx) => {
        const traslado = await tx.traslado.findUnique({
          where: { id },
          include: {
            origen: { select: { moneda: true, nombre: true } },
            destino: { select: { nombre: true } },
          },
        });
        if (!traslado) throw errores.noEncontrado('El traslado no existe.');
        // Cambio condicionado: dos anulaciones a la vez no pasan las dos.
        const cambio = await tx.traslado.updateMany({
          where: { id, anuladoEn: null },
          data: { anuladoEn: new Date(), anuladoPorId: actor.id, motivoAnulacion: motivo },
        });
        if (cambio.count === 0) throw errores.estadoInvalido('Ese traslado ya fue anulado.');

        const turno = await tx.turno.findUnique({
          where: { usuarioEnUso: actor.id },
          select: { id: true },
        });
        const originales = await tx.movimientoCuenta.findMany({ where: { trasladoId: id } });
        for (const original of originales) {
          await registrarMovimiento(tx, {
            cuentaId: original.cuentaId,
            sentido: original.sentido === 'entrada' ? 'salida' : 'entrada',
            monto: original.monto.toString(),
            moneda: traslado.origen.moneda as Moneda,
            origen: 'traslado_anulacion',
            trasladoId: id,
            revierteId: original.id,
            turnoId: turno?.id ?? null,
            usuarioId: actor.id,
          });
        }
        await registrarAuditoria(tx, {
          usuarioId: actor.id,
          accion: 'traslado.anular',
          entidad: 'traslado',
          entidadId: id,
          ip: contexto.ip,
          agenteUsuario: contexto.agenteUsuario,
          despues: { origen: traslado.origen.nombre, destino: traslado.destino.nombre, motivo },
        });
      });
      return cargar(id);
    },
  };
}

function repetido(
  fila: FilaTraslado & { creadoPorId: string },
  actor: Actor,
): { traslado: TrasladoPublico; repetido: true } {
  // La clave es secreta de quien la generó: otra persona que la repita no puede ver ese traslado.
  if (fila.creadoPorId !== actor.id) {
    throw errores.estadoInvalido('Esa clave de operación ya fue usada. Recarga la pantalla.');
  }
  return { traslado: aPublico(fila), repetido: true };
}
