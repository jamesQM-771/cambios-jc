import { Prisma } from '../../generated/prisma/client.js';
import type { Almacenamiento } from '../../lib/almacenamiento.js';
import { notificadorNulo, type Notificador } from '../../lib/tiempo-real.js';
import { errores } from '../../lib/errores.js';
import type { ImagenDetectada } from '../../lib/imagen.js';
import type { PrismaClient } from '../../lib/prisma.js';
import type { ContextoPeticion } from '../auth/servicio.js';
import { moverEstado, type Actor } from '../remesas/servicio.js';

import type { DatosCompletar, ItemCola, RespuestaCola } from './esquemas.js';

const SELECCION = {
  id: true,
  estado: true,
  creadoEn: true,
  montoBolivares: true,
  transferencia: {
    select: {
      operadorId: true,
      medioPago: {
        select: {
          tipo: true,
          banco: { select: { codigo: true, nombre: true } },
          numeroCuenta: true,
          telefonoPagoMovil: true,
          titular: true,
          tipoDocumentoTitular: true,
          numeroDocumentoTitular: true,
        },
      },
    },
  },
} satisfies Prisma.OperacionSelect;

type FilaCola = Prisma.OperacionGetPayload<{ select: typeof SELECCION }>;

export interface ResultadoCola {
  id: string;
  estado: 'en_cola' | 'tomada' | 'completada' | 'con_incidencia';
}

export type ServicioCola = ReturnType<typeof crearServicioCola>;

/** Solo el banco y el monto hasta que la persona la toma; recién entonces ve a quién pagar. */
function aItem(fila: FilaCola, usuarioId: string): ItemCola {
  const transferencia = fila.transferencia;
  if (!transferencia) throw new Error(`La remesa ${fila.id} no tiene transferencia.`);
  const medio = transferencia.medioPago;
  const mia = fila.estado === 'tomada' && transferencia.operadorId === usuarioId;
  return {
    id: fila.id,
    estado: fila.estado === 'tomada' ? 'tomada' : 'en_cola',
    enviadaEn: fila.creadoEn,
    montoBolivares: fila.montoBolivares.toFixed(3),
    tomadaPorMi: mia,
    pago: {
      tipo: medio.tipo,
      banco: medio.banco,
      numeroCuenta: mia ? medio.numeroCuenta : null,
      telefonoPagoMovil: mia ? medio.telefonoPagoMovil : null,
      titular: mia ? medio.titular : null,
      tipoDocumentoTitular: mia ? medio.tipoDocumentoTitular : null,
      numeroDocumentoTitular: mia ? medio.numeroDocumentoTitular : null,
    },
  };
}

export function crearServicioCola({
  prisma,
  almacenamiento,
  notificador = notificadorNulo,
}: {
  prisma: PrismaClient;
  almacenamiento: Almacenamiento;
  notificador?: Notificador;
}) {
  /** Avisa del cambio ya confirmado; un fallo al avisar nunca debe deshacer ni fallar la operación. */
  function avisar(id: string, estado: ResultadoCola['estado']): void {
    try {
      notificador.remesaCambio({ id, estado });
    } catch {
      // La pantalla igual consulta por su cuenta.
    }
  }

  async function cargarItem(id: string, usuarioId: string): Promise<ItemCola> {
    const fila = await prisma.operacion.findUnique({ where: { id }, select: SELECCION });
    if (!fila) throw errores.noEncontrado('La transferencia no existe.');
    return aItem(fila, usuarioId);
  }

  /** La transferencia debe seguir siendo de quien actúa: otra persona pudo recibirla por una liberación. */
  const exigirQueSeaMia = (actor: Actor) => async (tx: Prisma.TransactionClient, id: string) => {
    const transferencia = await tx.transferencia.findUnique({
      where: { operacionId: id },
      select: { operadorId: true },
    });
    if (transferencia?.operadorId !== actor.id) {
      throw errores.estadoInvalido('Esta transferencia la tiene otra persona.');
    }
  };

  return {
    async listar(usuarioId: string): Promise<RespuestaCola> {
      const [filas, cuentas, ultima] = await Promise.all([
        prisma.operacion.findMany({
          where: {
            OR: [
              { estado: 'en_cola' },
              { estado: 'tomada', transferencia: { operadorId: usuarioId } },
            ],
          },
          orderBy: { creadoEn: 'asc' },
          select: SELECCION,
        }),
        prisma.cuentaDinero.findMany({
          where: { activa: true, moneda: 'VES' },
          orderBy: { nombre: 'asc' },
          select: { id: true, nombre: true, comisionPorDefecto: true },
        }),
        prisma.transferencia.findFirst({
          where: { operadorId: usuarioId, cuentaOrigenId: { not: null } },
          orderBy: { completadaEn: 'desc' },
          select: { cuentaOrigenId: true },
        }),
      ]);
      return {
        remesas: filas.map((fila) => aItem(fila, usuarioId)),
        cuentasOrigen: cuentas.map((cuenta) => ({
          id: cuenta.id,
          nombre: cuenta.nombre,
          comisionPorDefecto: cuenta.comisionPorDefecto?.toFixed(3) ?? null,
        })),
        ultimaCuentaOrigenId: ultima?.cuentaOrigenId ?? null,
      };
    },

    /**
     * Toma una transferencia. La actualización es condicional al estado "en cola": si dos
     * digitadores la piden a la vez, una gana y la otra recibe el error (§5.4: con bloqueo).
     */
    async tomar(id: string, actor: Actor, contexto: ContextoPeticion): Promise<ItemCola> {
      await moverEstado(prisma, {
        id,
        desde: ['en_cola'],
        pasos: [{ estado: 'tomada', motivo: null }],
        accion: 'remesa.tomar',
        mensajeSiNo: 'Otra persona ya tomó esta transferencia o ya no está en la cola.',
        actor,
        contexto,
        dentro: async (tx) => {
          await tx.transferencia.update({
            where: { operacionId: id },
            data: { operadorId: actor.id, tomadaEn: new Date() },
          });
        },
      });
      avisar(id, 'tomada');
      return cargarItem(id, actor.id);
    },

    /** Quien la tomó la suelta sin pagarla: vuelve a la cola para cualquiera. */
    async devolverACola(
      id: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<ResultadoCola> {
      await moverEstado(prisma, {
        id,
        desde: ['tomada'],
        pasos: [{ estado: 'en_cola', motivo: 'Devuelta a la cola por el digitador.' }],
        accion: 'remesa.devolver_a_cola',
        mensajeSiNo: 'Solo puedes devolver una transferencia que tienes tomada.',
        actor,
        contexto,
        dentro: async (tx) => {
          await exigirQueSeaMia(actor)(tx, id);
          await tx.transferencia.update({
            where: { operacionId: id },
            data: { operadorId: null, tomadaEn: null },
          });
        },
      });
      avisar(id, 'en_cola');
      return { id, estado: 'en_cola' };
    },

    /** No se pudo pagar: pasa a incidencia con el motivo, para que el vendedor la corrija (§8). */
    async reportarIncidencia(
      id: string,
      motivo: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<ResultadoCola> {
      await moverEstado(prisma, {
        id,
        desde: ['tomada'],
        pasos: [{ estado: 'con_incidencia', motivo }],
        accion: 'remesa.incidencia',
        mensajeSiNo: 'Solo puedes reportar una incidencia de una transferencia que tienes tomada.',
        actor,
        contexto,
        dentro: (tx) => exigirQueSeaMia(actor)(tx, id),
      });
      avisar(id, 'con_incidencia');
      return { id, estado: 'con_incidencia' };
    },

    /**
     * Cierra la transferencia: guarda la captura y los datos del pago y la pasa a "completada".
     * Si el cambio de estado falla, la captura recién guardada se descarta.
     */
    async completar(
      id: string,
      datos: DatosCompletar,
      captura: { contenido: Buffer; imagen: ImagenDetectada },
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<ResultadoCola> {
      const operacion = await prisma.operacion.findUnique({
        where: { id },
        select: { lineaNegocio: { select: { monedaDestino: true } } },
      });
      if (!operacion) throw errores.noEncontrado('La transferencia no existe.');
      const cuenta = await prisma.cuentaDinero.findUnique({ where: { id: datos.cuentaOrigenId } });
      if (!cuenta?.activa) {
        throw errores.valorEnUso(
          'cuentaOrigenId',
          'La cuenta de origen no existe o está desactivada.',
        );
      }
      if (cuenta.moneda !== operacion.lineaNegocio.monedaDestino) {
        throw errores.valorEnUso(
          'cuentaOrigenId',
          `Esta transferencia se paga en ${operacion.lineaNegocio.monedaDestino}: elige una cuenta en esa moneda.`,
        );
      }

      const clave = await almacenamiento.guardarComprobante(
        captura.contenido,
        captura.imagen.extension,
      );
      try {
        await moverEstado(prisma, {
          id,
          desde: ['tomada'],
          pasos: [{ estado: 'completada', motivo: null }],
          accion: 'remesa.completar',
          mensajeSiNo: 'Solo puedes completar una transferencia que tienes tomada.',
          actor,
          contexto,
          dentro: async (tx) => {
            await exigirQueSeaMia(actor)(tx, id);
            await tx.transferencia.update({
              where: { operacionId: id },
              data: {
                cuentaOrigenId: cuenta.id,
                referenciaBancaria: datos.referenciaBancaria ?? null,
                costoBancario: datos.costoBancario ?? cuenta.comisionPorDefecto,
                comprobanteClave: clave,
                completadaEn: new Date(),
              },
            });
          },
        });
      } catch (error) {
        await almacenamiento.descartarComprobante(clave);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw errores.valorEnUso(
            'referenciaBancaria',
            'Esa referencia ya se usó en esta cuenta: revisa que no sea el mismo comprobante.',
          );
        }
        throw error;
      }
      avisar(id, 'completada');
      return { id, estado: 'completada' };
    },
  };
}
