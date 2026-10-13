import {
  bolivaresDesdePesos,
  Decimal,
  DECIMALES_TASA,
  fijarMonto,
  montoATexto,
  multiplicar,
} from '@cambios-jc/shared';

import { Prisma } from '../../generated/prisma/client.js';
import { errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type { DatosRegistrarRemesa, RemesaPublica } from './esquemas.js';

const PERSONA = {
  select: { id: true, tipoDocumento: true, numeroDocumento: true, nombre: true },
} as const;

const SELECCION = {
  id: true,
  numeroComprobante: true,
  estado: true,
  formaPago: true,
  lineaNegocio: { select: { id: true, nombre: true } },
  remitente: PERSONA,
  transferencia: {
    select: {
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
  const medio = fila.transferencia?.medioPago;
  if (!medio) throw new Error(`La remesa ${fila.id} no tiene medio de pago.`);
  return {
    id: fila.id,
    numeroComprobante: fila.numeroComprobante,
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
    montoPesos: fila.montoPesos.toFixed(2),
    montoBolivares: fila.montoBolivares.toFixed(3),
    tasaCalculada: fila.tasaCalculada.toFixed(DECIMALES_TASA),
    tasaUsada: fila.tasaUsada.toFixed(DECIMALES_TASA),
    motivoTasa: fila.motivoTasa,
    creadoPor: fila.creadoPor,
    creadoEn: fila.creadoEn,
  };
}

export function crearServicioRemesas({ prisma }: { prisma: PrismaClient }) {
  async function cargar(id: string): Promise<RemesaPublica> {
    const fila = await prisma.operacion.findUnique({ where: { id }, select: SELECCION });
    if (!fila) throw errores.noEncontrado('La remesa no existe.');
    return aPublica(fila);
  }

  return {
    obtener: cargar,

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
              montoPesos: montos.pesos,
              montoBolivares: montos.bolivares,
              tasaCalculada: tasaVigente.tasaVenta,
              tasaUsada: tasaUsada.toFixed(DECIMALES_TASA),
              motivoTasa: datos.tasaManual?.motivo ?? null,
              claveIdempotencia: datos.claveIdempotencia,
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
        return { remesa: await cargar(await crear()), repetida: false };
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
