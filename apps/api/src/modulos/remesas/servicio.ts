import {
  bolivaresDesdePesos,
  Decimal,
  DECIMALES_TASA,
  fijarMonto,
  montoATexto,
  multiplicar,
} from '@cambios-jc/shared';

import { Prisma, type EstadoOperacion } from '../../generated/prisma/client.js';
import { generarCodigoSeguimiento } from '../../lib/codigo-seguimiento.js';
import { errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { Almacenamiento, ComprobanteAbierto } from '../../lib/almacenamiento.js';
import { notificadorNulo, type Notificador } from '../../lib/tiempo-real.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import { ingresarPorRemesa, revertirIngresoDeRemesa } from './movimientos.js';

import type {
  DatosRegistrarRemesa,
  EventoRemesa,
  OpcionesRemesa,
  RemesaPublica,
} from './esquemas.js';

const PERSONA = {
  select: { id: true, tipoDocumento: true, numeroDocumento: true, nombre: true },
} as const;

const SELECCION = {
  id: true,
  numeroComprobante: true,
  codigoSeguimiento: true,
  estado: true,
  formaPago: true,
  lineaNegocio: { select: { id: true, nombre: true } },
  remitente: PERSONA,
  transferencia: {
    select: {
      operador: { select: { id: true, nombre: true } },
      tomadaEn: true,
      cuentaOrigen: { select: { id: true, nombre: true } },
      referenciaBancaria: true,
      costoBancario: true,
      comprobanteClave: true,
      completadaEn: true,
      medioPago: {
        select: {
          id: true,
          tipo: true,
          banco: { select: { codigo: true, nombre: true } },
          numeroCuenta: true,
          telefonoPagoMovil: true,
          titular: true,
          tipoDocumentoTitular: true,
          numeroDocumentoTitular: true,
          cliente: PERSONA,
        },
      },
    },
  },
  cuentaIngreso: { select: { id: true, nombre: true } },
  turno: { select: { id: true, caja: { select: { id: true, nombre: true } } } },
  montoPesos: true,
  montoBolivares: true,
  tasaCalculada: true,
  tasaUsada: true,
  motivoTasa: true,
  creadoPor: { select: { id: true, nombre: true } },
  creadoEn: true,
} satisfies Prisma.OperacionSelect;

type FilaRemesa = Prisma.OperacionGetPayload<{ select: typeof SELECCION }>;

const MAXIMO_LISTA = 100;

/** Estados por los que pasa una remesa pagada en efectivo: el dinero ya está en caja (decisión 1). */
const RUTA_EFECTIVO = ['pago_verificado', 'en_cola'] as const;

export interface Actor {
  id: string;
}

export interface ResultadoRegistro {
  remesa: RemesaPublica;
  /** `true` si la clave de idempotencia ya existía: se devuelve lo creado antes, sin duplicar. */
  repetida: boolean;
}

export type ServicioRemesas = ReturnType<typeof crearServicioRemesas>;

function aPublica(fila: FilaRemesa): RemesaPublica {
  const transferencia = fila.transferencia;
  const medio = transferencia?.medioPago;
  if (!transferencia || !medio) throw new Error(`La remesa ${fila.id} no tiene medio de pago.`);
  return {
    id: fila.id,
    numeroComprobante: fila.numeroComprobante,
    codigoSeguimiento: fila.codigoSeguimiento,
    estado: fila.estado,
    formaPago: fila.formaPago,
    lineaNegocio: fila.lineaNegocio,
    remitente: fila.remitente,
    beneficiario: {
      cliente: medio.cliente,
      medioPagoId: medio.id,
      tipo: medio.tipo,
      banco: medio.banco,
      numeroCuenta: medio.numeroCuenta,
      telefonoPagoMovil: medio.telefonoPagoMovil,
      titular: medio.titular,
      tipoDocumentoTitular: medio.tipoDocumentoTitular,
      numeroDocumentoTitular: medio.numeroDocumentoTitular,
    },
    cuentaIngreso: fila.cuentaIngreso,
    turno: fila.turno,
    montoPesos: fila.montoPesos.toFixed(2),
    montoBolivares: fila.montoBolivares.toFixed(3),
    tasaCalculada: fila.tasaCalculada.toFixed(DECIMALES_TASA),
    tasaUsada: fila.tasaUsada.toFixed(DECIMALES_TASA),
    motivoTasa: fila.motivoTasa,
    pago: {
      operador: transferencia.operador,
      tomadaEn: transferencia.tomadaEn,
      cuentaOrigen: transferencia.cuentaOrigen,
      referenciaBancaria: transferencia.referenciaBancaria,
      costoBancario: transferencia.costoBancario?.toFixed(3) ?? null,
      tieneComprobante: transferencia.comprobanteClave !== null,
      completadaEn: transferencia.completadaEn,
    },
    creadoPor: fila.creadoPor,
    creadoEn: fila.creadoEn,
  };
}

export function crearServicioRemesas({
  prisma,
  almacenamiento,
  notificador = notificadorNulo,
}: {
  prisma: PrismaClient;
  almacenamiento: Almacenamiento;
  notificador?: Notificador;
}) {
  /** Avisa del cambio ya confirmado. Un fallo al avisar nunca debe deshacer ni fallar la operación. */
  function avisar(remesa: RemesaPublica): RemesaPublica {
    try {
      notificador.remesaCambio({ id: remesa.id, estado: remesa.estado });
    } catch {
      // La pantalla igual consulta por su cuenta.
    }
    return remesa;
  }

  async function cargar(id: string): Promise<RemesaPublica> {
    const fila = await prisma.operacion.findUnique({ where: { id }, select: SELECCION });
    if (!fila) throw errores.noEncontrado('La remesa no existe.');
    return aPublica(fila);
  }

  return {
    /** Costo y ganancia fijados al pagarse (D140). Solo para quien tiene `ganancia.ver`. */
    async ganancia(id: string) {
      const fila = await prisma.operacion.findUnique({
        where: { id },
        select: {
          costoPromedio: true,
          gananciaBruta: true,
          costoBancarioPesos: true,
          gananciaNeta: true,
        },
      });
      if (!fila) throw errores.noEncontrado('La remesa no existe.');
      if (!fila.costoPromedio || !fila.gananciaBruta || !fila.gananciaNeta) return null;
      return {
        costoPromedio: fila.costoPromedio.toFixed(DECIMALES_TASA),
        bruta: fila.gananciaBruta.toFixed(2),
        costoBancarioPesos: fila.costoBancarioPesos?.toFixed(2) ?? '0.00',
        neta: fila.gananciaNeta.toFixed(2),
      };
    },

    obtener: cargar,

    async opciones(actor: Actor): Promise<OpcionesRemesa> {
      const [lineas, cuentas, miTurno] = await Promise.all([
        prisma.lineaNegocio.findMany({
          where: { clase: 'remesa', activa: true },
          orderBy: { nombre: 'asc' },
          select: {
            id: true,
            nombre: true,
            monedaOrigen: true,
            monedaDestino: true,
            tasas: { where: { vigenteHasta: null }, take: 1, select: { tasaVenta: true } },
          },
        }),
        prisma.cuentaDinero.findMany({
          where: { activa: true },
          orderBy: { nombre: 'asc' },
          select: { id: true, nombre: true, tipo: true, moneda: true, cajaId: true },
        }),
        prisma.turno.findUnique({
          where: { usuarioEnUso: actor.id },
          select: { id: true, caja: { select: { id: true, nombre: true } } },
        }),
      ]);
      return {
        lineas: lineas.map(({ tasas, ...linea }) => ({
          ...linea,
          tasaVenta: tasas[0]?.tasaVenta.toFixed(DECIMALES_TASA) ?? null,
        })),
        cuentasIngreso: cuentas,
        miTurno,
      };
    },

    async historial(id: string): Promise<EventoRemesa[]> {
      await cargar(id);
      return prisma.eventoOperacion.findMany({
        where: { operacionId: id },
        orderBy: { creadoEn: 'asc' },
        select: {
          estadoAnterior: true,
          estadoNuevo: true,
          motivo: true,
          usuario: { select: { id: true, nombre: true } },
          creadoEn: true,
        },
      });
    },

    /**
     * El vendedor confirma que el dinero del cliente llegó (transferencia). La remesa pasa a
     * "pago verificado" y de inmediato el sistema la publica en la cola del digitador (§8).
     */
    async verificarPago(
      id: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<RemesaPublica> {
      await moverEstado(prisma, {
        id,
        desde: ['registrada'],
        pasos: [
          { estado: 'pago_verificado', motivo: 'Pago verificado por el vendedor.' },
          { estado: 'en_cola', motivo: null },
        ],
        accion: 'remesa.verificar_pago',
        mensajeSiNo: 'Solo se verifica el pago de una remesa registrada que aún no pasó a la cola.',
        actor,
        contexto,
        dentro: (tx) => ingresarPorRemesa(tx, id, actor.id),
      });
      return avisar(await cargar(id));
    },

    /**
     * Tras una incidencia, el vendedor corrige a dónde se paga y la remesa vuelve a la cola (§8).
     * Solo cambia el medio de pago: los montos y la tasa no se tocan (el digitador tampoco los
     * cambia). "Corregida" queda como evento del historial, no como estado.
     */
    async corregirPago(
      id: string,
      datos: { medioPagoId: string; nota?: string | undefined },
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<RemesaPublica> {
      const medio = await prisma.medioPago.findUnique({
        where: { id: datos.medioPagoId },
        include: { cliente: true },
      });
      if (!medio?.activo || !medio.cliente.activo) {
        throw errores.estadoInvalido(
          'Los datos de pago no existen o están desactivados: agrega unos nuevos al cliente.',
        );
      }
      const anterior = await prisma.transferencia.findUnique({
        where: { operacionId: id },
        select: { medioPagoId: true },
      });
      if (!anterior) throw errores.noEncontrado('La remesa no existe.');
      await moverEstado(prisma, {
        id,
        desde: ['con_incidencia'],
        pasos: [
          {
            estado: 'en_cola',
            motivo: datos.nota
              ? `Datos de pago corregidos: ${datos.nota}`
              : 'Datos de pago corregidos.',
          },
        ],
        accion: 'remesa.corregir',
        mensajeSiNo: 'Solo se corrige una remesa que quedó con incidencia.',
        detalle: { medioPagoAnteriorId: anterior.medioPagoId, medioPagoNuevoId: medio.id },
        actor,
        contexto,
        dentro: async (tx) => {
          // Vuelve a la cola de todos: quien la tenía tomada ya no es su operador.
          await tx.transferencia.update({
            where: { operacionId: id },
            data: { medioPagoId: medio.id, operadorId: null, tomadaEn: null },
          });
        },
      });
      return avisar(await cargar(id));
    },

    /**
     * El administrador libera una remesa que un digitador dejó tomada sin terminar (decisión 5):
     * vuelve a la cola y deja de tener operador.
     */
    async liberar(id: string, actor: Actor, contexto: ContextoPeticion): Promise<RemesaPublica> {
      await moverEstado(prisma, {
        id,
        desde: ['tomada'],
        pasos: [{ estado: 'en_cola', motivo: 'Liberada por el administrador.' }],
        accion: 'remesa.liberar',
        mensajeSiNo: 'Solo se libera una remesa que un digitador tiene tomada.',
        actor,
        contexto,
        dentro: async (tx) => {
          await tx.transferencia.update({
            where: { operacionId: id },
            data: { operadorId: null, tomadaEn: null },
          });
        },
      });
      return avisar(await cargar(id));
    },

    /** Captura del comprobante que cargó el digitador, para que el vendedor la revise. */
    async abrirComprobante(id: string): Promise<ComprobanteAbierto> {
      const transferencia = await prisma.transferencia.findUnique({
        where: { operacionId: id },
        select: { comprobanteClave: true },
      });
      if (!transferencia) throw errores.noEncontrado('La remesa no existe.');
      const abierto = transferencia.comprobanteClave
        ? await almacenamiento.abrirComprobante(transferencia.comprobanteClave)
        : null;
      if (!abierto) throw errores.noEncontrado('Esta remesa no tiene comprobante.');
      return abierto;
    },

    /** Solo mientras nadie la ha tomado para pagarla (decisión 4). Siempre con motivo. */
    async anular(
      id: string,
      motivo: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<RemesaPublica> {
      await moverEstado(prisma, {
        id,
        desde: ['registrada', 'pago_verificado', 'en_cola'],
        pasos: [{ estado: 'anulada', motivo }],
        accion: 'remesa.anular',
        mensajeSiNo:
          'Ya no se puede anular: el digitador la tomó o ya terminó. Si hay un problema, se maneja como incidencia o devolución.',
        actor,
        contexto,
        dentro: (tx) => revertirIngresoDeRemesa(tx, id, actor.id),
      });
      return avisar(await cargar(id));
    },

    /**
     * El administrador devuelve al cliente todo lo que entregó, por la misma cuenta por la que entró,
     * cuando el pago no se pudo hacer ni corregir (D126). Solo desde "con incidencia", siempre con motivo.
     */
    async devolver(
      id: string,
      motivo: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<RemesaPublica> {
      await moverEstado(prisma, {
        id,
        desde: ['con_incidencia'],
        pasos: [{ estado: 'devuelta', motivo }],
        accion: 'remesa.devolver',
        mensajeSiNo: 'Solo se devuelve el dinero de una remesa que quedó con incidencia.',
        actor,
        contexto,
        dentro: (tx) =>
          revertirIngresoDeRemesa(tx, id, actor.id, { origen: 'remesa_devolucion', exigir: true }),
      });
      return avisar(await cargar(id));
    },

    async listar(filtro: { estado?: FilaRemesa['estado'] | undefined }): Promise<RemesaPublica[]> {
      const filas = await prisma.operacion.findMany({
        where: filtro.estado ? { estado: filtro.estado } : {},
        orderBy: { numeroComprobante: 'desc' },
        take: MAXIMO_LISTA,
        select: SELECCION,
      });
      return filas.map(aPublica);
    },

    async registrar(
      datos: DatosRegistrarRemesa,
      actor: Actor,
      puedeCambiarTasa: boolean,
      contexto: ContextoPeticion,
    ): Promise<ResultadoRegistro> {
      // Reintento de una petición que ya se procesó: se devuelve lo mismo, sin tocar nada.
      const previa = await prisma.operacion.findUnique({
        where: { claveIdempotencia: datos.claveIdempotencia },
        select: { ...SELECCION, creadoPorId: true },
      });
      if (previa) return resultadoRepetido(previa, actor);

      if (datos.tasaManual && !puedeCambiarTasa) throw errores.sinPermiso();

      // Toda remesa se registra dentro de un turno de caja: así entra al arqueo de quien la vendió (D123).
      const turno = await prisma.turno.findUnique({
        where: { usuarioEnUso: actor.id },
        select: { id: true, cajaId: true },
      });
      if (!turno)
        throw errores.estadoInvalido('Abre tu turno de caja antes de registrar una remesa.');

      const [linea, remitente, medio, cuenta] = await Promise.all([
        prisma.lineaNegocio.findUnique({ where: { id: datos.lineaNegocioId } }),
        prisma.cliente.findUnique({ where: { id: datos.remitenteId } }),
        prisma.medioPago.findUnique({
          where: { id: datos.medioPagoId },
          include: { cliente: true },
        }),
        prisma.cuentaDinero.findUnique({ where: { id: datos.cuentaIngresoId } }),
      ]);

      if (linea?.clase !== 'remesa' || !linea.activa) {
        throw errores.estadoInvalido(
          'La línea de negocio no existe, está desactivada o no es de remesas.',
        );
      }
      if (!remitente?.activo)
        throw errores.estadoInvalido('El remitente no existe o está desactivado.');
      if (!medio?.activo || !medio.cliente.activo) {
        throw errores.estadoInvalido(
          'Los datos de pago del beneficiario no existen o están desactivados.',
        );
      }
      if (!cuenta?.activa)
        throw errores.estadoInvalido('La cuenta de ingreso no existe o está desactivada.');
      if (cuenta.moneda !== linea.monedaOrigen) {
        throw errores.estadoInvalido(
          `La cuenta de ingreso es en ${cuenta.moneda}; esta remesa recibe ${linea.monedaOrigen}.`,
        );
      }
      // Efectivo entra a una caja; una transferencia entra a una cuenta bancaria o billetera.
      if ((datos.formaPago === 'efectivo') !== (cuenta.tipo === 'caja')) {
        throw errores.estadoInvalido(
          datos.formaPago === 'efectivo'
            ? 'El pago en efectivo entra a una caja, no a una cuenta bancaria.'
            : 'Una transferencia entra a una cuenta bancaria, no a una caja.',
        );
      }
      // El efectivo queda en la caja que se va a arquear al cerrar este turno, no en otra.
      if (datos.formaPago === 'efectivo' && cuenta.cajaId !== turno.cajaId) {
        throw errores.estadoInvalido('El efectivo entra a la cuenta de la caja de tu turno.');
      }

      const tasaVigente = await prisma.tasa.findFirst({
        where: { lineaNegocioId: linea.id, vigenteHasta: null },
      });
      if (!tasaVigente) {
        throw errores.estadoInvalido(
          'No hay una tasa vigente para esta línea: publica una primero.',
        );
      }

      // La tasa usada es la manual (con permiso y motivo) o la publicada; nunca la que mande la pantalla.
      const tasaUsada = datos.tasaManual
        ? new Decimal(datos.tasaManual.tasa)
        : new Decimal(tasaVigente.tasaVenta.toString());
      const montos = calcularMontos(datos, tasaUsada);

      const crear = () =>
        prisma.$transaction(async (tx) => {
          const filas = await tx.$queryRaw<{ valor: number }[]>`
            UPDATE "contador" SET "valor" = "valor" + 1 WHERE "clave" = 'comprobante' RETURNING "valor"`;
          const numero = filas[0]?.valor;
          if (numero === undefined) throw new Error('Falta el contador de comprobantes.');

          const estados = datos.formaPago === 'efectivo' ? RUTA_EFECTIVO : [];
          const estadoFinal = estados.at(-1) ?? 'registrada';
          const creada = await tx.operacion.create({
            data: {
              numeroComprobante: numero,
              tipo: 'remesa_venta',
              estado: estadoFinal,
              lineaNegocioId: linea.id,
              tasaId: tasaVigente.id,
              remitenteId: remitente.id,
              formaPago: datos.formaPago,
              cuentaIngresoId: cuenta.id,
              turnoId: turno.id,
              montoPesos: montos.pesos,
              montoBolivares: montos.bolivares,
              tasaCalculada: tasaVigente.tasaVenta,
              tasaUsada: tasaUsada.toFixed(DECIMALES_TASA),
              motivoTasa: datos.tasaManual?.motivo ?? null,
              claveIdempotencia: datos.claveIdempotencia,
              codigoSeguimiento: generarCodigoSeguimiento(),
              creadoPorId: actor.id,
              transferencia: { create: { medioPagoId: medio.id } },
            },
            select: { id: true },
          });

          let anterior: (typeof estados)[number] | 'registrada' | null = null;
          for (const estado of ['registrada', ...estados] as const) {
            await tx.eventoOperacion.create({
              data: {
                operacionId: creada.id,
                estadoAnterior: anterior,
                estadoNuevo: estado,
                motivo: estado === 'pago_verificado' ? 'Pago en efectivo recibido en caja.' : null,
                usuarioId: actor.id,
              },
            });
            anterior = estado;
          }

          // El efectivo ya está en la caja; la transferencia entra cuando se verifica (D121).
          if (datos.formaPago === 'efectivo') await ingresarPorRemesa(tx, creada.id, actor.id);

          await registrarAuditoria(tx, {
            usuarioId: actor.id,
            accion: 'remesa.registrar',
            entidad: 'operacion',
            entidadId: creada.id,
            ip: contexto.ip,
            agenteUsuario: contexto.agenteUsuario,
            despues: {
              numeroComprobante: numero,
              estado: estadoFinal,
              formaPago: datos.formaPago,
              montoPesos: montos.pesos,
              montoBolivares: montos.bolivares,
              tasaCalculada: tasaVigente.tasaVenta.toFixed(DECIMALES_TASA),
              tasaUsada: tasaUsada.toFixed(DECIMALES_TASA),
              motivoTasa: datos.tasaManual?.motivo ?? null,
            },
          });
          return creada.id;
        });

      try {
        return { remesa: avisar(await cargar(await crear())), repetida: false };
      } catch (error) {
        // Dos peticiones con la misma clave a la vez: gana una y la otra devuelve esa misma remesa.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const ganadora = await prisma.operacion.findUnique({
            where: { claveIdempotencia: datos.claveIdempotencia },
            select: { ...SELECCION, creadoPorId: true },
          });
          if (ganadora) return resultadoRepetido(ganadora, actor);
        }
        throw error;
      }
    },
  };
}

export interface CambioDeEstado {
  id: string;
  /** Datos extra para la bitácora (sin documentos ni cuentas completos). */
  detalle?: Record<string, unknown> | undefined;
  /** Trabajo extra que debe confirmarse o deshacerse junto con el cambio (misma transacción). */
  dentro?: ((tx: Prisma.TransactionClient) => Promise<void>) | undefined;
  desde: readonly EstadoOperacion[];
  pasos: readonly { estado: EstadoOperacion; motivo: string | null }[];
  accion: string;
  mensajeSiNo: string;
  actor: Actor;
  contexto: ContextoPeticion;
}

/**
 * Cambia el estado de una remesa de forma atómica: la actualización exige que siga en uno de los
 * estados de origen, así dos personas que actúan a la vez no pisan el cambio de la otra. Deja un
 * evento por cada paso y la acción en la bitácora, todo en la misma transacción.
 */
export async function moverEstado(prisma: PrismaClient, cambio: CambioDeEstado): Promise<void> {
  const ultimo = cambio.pasos.at(-1);
  if (!ultimo) throw new Error('Un cambio de estado necesita al menos un paso.');
  await prisma.$transaction(async (tx) => {
    const actual = await tx.operacion.findUnique({
      where: { id: cambio.id },
      select: { estado: true },
    });
    if (!actual) throw errores.noEncontrado('La remesa no existe.');
    const actualizadas = await tx.operacion.updateMany({
      where: { id: cambio.id, estado: { in: [...cambio.desde] } },
      data: { estado: ultimo.estado },
    });
    if (actualizadas.count === 0) throw errores.estadoInvalido(cambio.mensajeSiNo);
    await cambio.dentro?.(tx);

    let anterior: EstadoOperacion = actual.estado;
    for (const paso of cambio.pasos) {
      await tx.eventoOperacion.create({
        data: {
          operacionId: cambio.id,
          estadoAnterior: anterior,
          estadoNuevo: paso.estado,
          motivo: paso.motivo,
          usuarioId: cambio.actor.id,
        },
      });
      anterior = paso.estado;
    }
    await registrarAuditoria(tx, {
      usuarioId: cambio.actor.id,
      accion: cambio.accion,
      entidad: 'operacion',
      entidadId: cambio.id,
      ip: cambio.contexto.ip,
      agenteUsuario: cambio.contexto.agenteUsuario,
      antes: { estado: actual.estado },
      despues: { estado: ultimo.estado, motivo: ultimo.motivo, ...cambio.detalle },
    });
  });
}

function resultadoRepetido(
  fila: FilaRemesa & { creadoPorId: string },
  actor: Actor,
): ResultadoRepetido {
  // La clave es secreta de quien la generó: otra persona que la repita no puede ver esa remesa.
  if (fila.creadoPorId !== actor.id) {
    throw errores.estadoInvalido('Esa clave de operación ya fue usada. Recarga la pantalla.');
  }
  return { remesa: aPublica(fila), repetida: true };
}

type ResultadoRepetido = ResultadoRegistro;

/**
 * Pesos y bolívares de la remesa. Se parte de lo que el cliente fijó (pesos o bolívares) y el otro
 * lado se calcula con la tasa usada: pesos ÷ tasa (truncado a 3 decimales, D15) o bolívares × tasa.
 */
export function calcularMontos(
  datos: Pick<DatosRegistrarRemesa, 'montoPesos' | 'montoBolivares'>,
  tasa: Decimal,
): { pesos: string; bolivares: string } {
  if (datos.montoPesos !== undefined) {
    const pesos = fijarMonto(datos.montoPesos, 'COP');
    const bolivares = bolivaresDesdePesos(pesos, tasa);
    if (bolivares.isZero()) {
      throw errores.estadoInvalido('El monto es muy pequeño: no alcanza para 0,001 bolívares.');
    }
    return { pesos: montoATexto(pesos, 'COP'), bolivares: montoATexto(bolivares, 'VES') };
  }
  const bolivares = fijarMonto(datos.montoBolivares ?? '0', 'VES');
  const pesos = fijarMonto(multiplicar(bolivares, tasa), 'COP');
  return { pesos: montoATexto(pesos, 'COP'), bolivares: montoATexto(bolivares, 'VES') };
}
