import { comparar, finDelDia, inicioDelDia, montoATexto, type Moneda } from '@cambios-jc/shared';

import { Prisma } from '../../generated/prisma/client.js';
import { errores } from '../../lib/errores.js';
import { registrarMovimiento } from '../../lib/libro.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type { DatosRegistrarGasto, GastoPublico } from './esquemas.js';

const MAXIMO_LISTA = 100;

const SELECCION = {
  id: true,
  tipo: true,
  categoria: { select: { id: true, nombre: true } },
  descripcion: true,
  cuenta: {
    select: {
      id: true,
      nombre: true,
      moneda: true,
      sucursal: { select: { id: true, nombre: true } },
    },
  },
  monto: true,
  turno: { select: { id: true, caja: { select: { id: true, nombre: true } } } },
  creadoPor: { select: { id: true, nombre: true } },
  creadoEn: true,
  anuladoEn: true,
  anuladoPor: { select: { id: true, nombre: true } },
  motivoAnulacion: true,
} satisfies Prisma.GastoSelect;

type FilaGasto = Prisma.GastoGetPayload<{ select: typeof SELECCION }>;

interface Actor {
  id: string;
}

export type ServicioGastos = ReturnType<typeof crearServicioGastos>;

function aPublico(fila: FilaGasto): GastoPublico {
  return {
    id: fila.id,
    tipo: fila.tipo,
    categoria: fila.categoria,
    descripcion: fila.descripcion,
    cuenta: fila.cuenta,
    monto: montoATexto(fila.monto.toString(), fila.cuenta.moneda as Moneda),
    turno: fila.turno,
    creadoPor: fila.creadoPor,
    creadoEn: fila.creadoEn,
    anulado:
      fila.anuladoEn && fila.anuladoPor && fila.motivoAnulacion
        ? { por: fila.anuladoPor, en: fila.anuladoEn, motivo: fila.motivoAnulacion }
        : null,
  };
}

export function crearServicioGastos({ prisma }: { prisma: PrismaClient }) {
  async function cargar(id: string): Promise<GastoPublico> {
    const fila = await prisma.gasto.findUnique({ where: { id }, select: SELECCION });
    if (!fila) throw errores.noEncontrado('El gasto no existe.');
    return aPublico(fila);
  }

  return {
    obtener: cargar,

    async opciones(actor: Actor, puedeGestionar: boolean) {
      const [categorias, cuentas, miTurno] = await Promise.all([
        prisma.categoriaGasto.findMany({
          where: { activa: true },
          orderBy: { nombre: 'asc' },
          select: { id: true, nombre: true },
        }),
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
      return { categorias, cuentas, miTurno, puedeGestionar };
    },

    async listar(filtro: {
      tipo?: 'operativo' | 'retiro_dueno' | undefined;
      cuentaId?: string | undefined;
      categoriaId?: string | undefined;
      desde?: string | undefined;
      hasta?: string | undefined;
    }): Promise<GastoPublico[]> {
      const empresa = await prisma.empresa.findUnique({ where: { unica: true } });
      const zona = empresa?.zonaHoraria ?? 'America/Bogota';
      const filas = await prisma.gasto.findMany({
        where: {
          ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
          ...(filtro.cuentaId ? { cuentaId: filtro.cuentaId } : {}),
          ...(filtro.categoriaId ? { categoriaId: filtro.categoriaId } : {}),
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
     * Saca plata de una cuenta: un gasto operativo (resta a la ganancia) o un retiro del dueño (no
     * resta). Quien no es administrador necesita su turno abierto y paga desde la caja de su turno,
     * que es de donde sale el efectivo; el retiro del dueño es solo del administrador (D125).
     */
    async registrar(
      datos: DatosRegistrarGasto,
      actor: Actor,
      puedeGestionar: boolean,
      contexto: ContextoPeticion,
    ): Promise<{ gasto: GastoPublico; repetido: boolean }> {
      const previo = await prisma.gasto.findUnique({
        where: { claveIdempotencia: datos.claveIdempotencia },
        select: { ...SELECCION, creadoPorId: true },
      });
      if (previo) return repetido(previo, actor);

      if (datos.tipo === 'retiro_dueno' && !puedeGestionar) throw errores.sinPermiso();

      const [cuenta, categoria, turno] = await Promise.all([
        prisma.cuentaDinero.findUnique({ where: { id: datos.cuentaId } }),
        datos.categoriaId
          ? prisma.categoriaGasto.findUnique({ where: { id: datos.categoriaId } })
          : Promise.resolve(null),
        prisma.turno.findUnique({
          where: { usuarioEnUso: actor.id },
          select: { id: true, cajaId: true },
        }),
      ]);
      if (!cuenta?.activa) {
        throw errores.estadoInvalido('La cuenta no existe o está desactivada.');
      }
      if (datos.categoriaId && !categoria?.activa) {
        throw errores.estadoInvalido('La categoría no existe o está desactivada.');
      }
      const moneda = cuenta.moneda as Moneda;
      // Nunca se redondea en silencio: más decimales de los que admite la moneda se rechazan.
      const monto = montoATexto(datos.monto, moneda);
      if (comparar(monto, datos.monto) !== 0) {
        throw errores.estadoInvalido(`Los montos en ${moneda} no admiten ese número de decimales.`);
      }

      if (!puedeGestionar) {
        if (!turno)
          throw errores.estadoInvalido('Abre tu turno de caja antes de registrar un gasto.');
        if (cuenta.tipo !== 'caja' || cuenta.cajaId !== turno.cajaId) {
          throw errores.estadoInvalido(
            'Los gastos se pagan con el efectivo de la caja de tu turno. Pídele al administrador los demás.',
          );
        }
      }

      const crear = () =>
        prisma.$transaction(async (tx) => {
          const creado = await tx.gasto.create({
            data: {
              tipo: datos.tipo,
              categoriaId: categoria?.id ?? null,
              descripcion: datos.descripcion,
              cuentaId: cuenta.id,
              monto,
              turnoId: turno?.id ?? null,
              claveIdempotencia: datos.claveIdempotencia,
              creadoPorId: actor.id,
            },
            select: { id: true },
          });
          await registrarMovimiento(tx, {
            cuentaId: cuenta.id,
            sentido: 'salida',
            monto,
            moneda,
            origen: datos.tipo === 'operativo' ? 'gasto' : 'retiro_dueno',
            gastoId: creado.id,
            turnoId: turno?.id ?? null,
            usuarioId: actor.id,
          });
          await registrarAuditoria(tx, {
            usuarioId: actor.id,
            accion: 'gasto.registrar',
            entidad: 'gasto',
            entidadId: creado.id,
            ip: contexto.ip,
            agenteUsuario: contexto.agenteUsuario,
            despues: {
              tipo: datos.tipo,
              categoria: categoria?.nombre ?? null,
              descripcion: datos.descripcion,
              cuenta: cuenta.nombre,
              moneda,
              monto,
            },
          });
          return creado.id;
        });

      try {
        return { gasto: await cargar(await crear()), repetido: false };
      } catch (error) {
        // Dos peticiones con la misma clave a la vez: gana una y la otra devuelve ese mismo gasto.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const ganador = await prisma.gasto.findUnique({
            where: { claveIdempotencia: datos.claveIdempotencia },
            select: { ...SELECCION, creadoPorId: true },
          });
          if (ganador) return repetido(ganador, actor);
        }
        throw error;
      }
    },

    /** Devuelve el dinero a la cuenta con un movimiento contrario. Solo el administrador, con motivo. */
    async anular(
      id: string,
      motivo: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<GastoPublico> {
      await prisma.$transaction(async (tx) => {
        const gasto = await tx.gasto.findUnique({
          where: { id },
          include: { cuenta: { select: { moneda: true, nombre: true } } },
        });
        if (!gasto) throw errores.noEncontrado('El gasto no existe.');
        // Cambio condicionado: dos anulaciones a la vez no pasan las dos.
        const cambio = await tx.gasto.updateMany({
          where: { id, anuladoEn: null },
          data: { anuladoEn: new Date(), anuladoPorId: actor.id, motivoAnulacion: motivo },
        });
        if (cambio.count === 0) throw errores.estadoInvalido('Ese gasto ya fue anulado.');

        const turno = await tx.turno.findUnique({
          where: { usuarioEnUso: actor.id },
          select: { id: true },
        });
        const original = await tx.movimientoCuenta.findFirstOrThrow({
          where: { gastoId: id, reversion: { is: null } },
        });
        await registrarMovimiento(tx, {
          cuentaId: original.cuentaId,
          sentido: 'entrada',
          monto: original.monto.toString(),
          moneda: gasto.cuenta.moneda as Moneda,
          origen: 'gasto_anulacion',
          gastoId: id,
          revierteId: original.id,
          turnoId: turno?.id ?? null,
          usuarioId: actor.id,
        });
        await registrarAuditoria(tx, {
          usuarioId: actor.id,
          accion: 'gasto.anular',
          entidad: 'gasto',
          entidadId: id,
          ip: contexto.ip,
          agenteUsuario: contexto.agenteUsuario,
          despues: { tipo: gasto.tipo, cuenta: gasto.cuenta.nombre, motivo },
        });
      });
      return cargar(id);
    },
  };
}

function repetido(
  fila: FilaGasto & { creadoPorId: string },
  actor: Actor,
): { gasto: GastoPublico; repetido: true } {
  // La clave es secreta de quien la generó: otra persona que la repita no puede ver ese gasto.
  if (fila.creadoPorId !== actor.id) {
    throw errores.estadoInvalido('Esa clave de operación ya fue usada. Recarga la pantalla.');
  }
  return { gasto: aPublico(fila), repetido: true };
}
