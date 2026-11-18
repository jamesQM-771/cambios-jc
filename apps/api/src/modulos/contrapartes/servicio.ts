import {
  comparar,
  efectoDeMovimiento,
  montoATexto,
  sentidoEnCuenta,
  sumar,
  type Moneda,
} from '@cambios-jc/shared';

import { Prisma } from '../../generated/prisma/client.js';
import { errores } from '../../lib/errores.js';
import { registrarMovimiento } from '../../lib/libro.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type {
  ContrapartePublica,
  DatosCrearContraparte,
  DatosEditarContraparte,
  DatosRegistrarMovimiento,
  MovimientoPublico,
} from './esquemas.js';

const MAXIMO_MOVIMIENTOS = 200;

const SELECCION_CONTRAPARTE = {
  id: true,
  nombre: true,
  tipo: true,
  documento: true,
  telefono: true,
  notas: true,
  activa: true,
  creadoEn: true,
  cuentasTitular: {
    select: { id: true, nombre: true, moneda: true },
    orderBy: { nombre: 'asc' },
  },
} satisfies Prisma.ContraparteSelect;

type FilaContraparte = Prisma.ContraparteGetPayload<{ select: typeof SELECCION_CONTRAPARTE }>;

const SELECCION_MOVIMIENTO = {
  id: true,
  tipo: true,
  moneda: true,
  monto: true,
  signo: true,
  cuenta: { select: { id: true, nombre: true } },
  nota: true,
  revierteId: true,
  reversion: {
    select: {
      id: true,
      nota: true,
      creadoEn: true,
      usuario: { select: { id: true, nombre: true } },
    },
  },
  compra: { select: { id: true } },
  usuario: { select: { id: true, nombre: true } },
  creadoEn: true,
  contraparteId: true,
  usuarioId: true,
} satisfies Prisma.MovimientoContraparteSelect;

type FilaMovimiento = Prisma.MovimientoContraparteGetPayload<{
  select: typeof SELECCION_MOVIMIENTO;
}>;

interface Actor {
  id: string;
}

export type ServicioContrapartes = ReturnType<typeof crearServicioContrapartes>;

interface FilaSaldo {
  contraparte_id: string;
  moneda: string;
  saldo: Prisma.Decimal;
}

function aMovimientoPublico(fila: FilaMovimiento): MovimientoPublico {
  return {
    id: fila.id,
    tipo: fila.tipo,
    moneda: fila.moneda,
    monto: montoATexto(fila.monto.toString(), fila.moneda as Moneda),
    signo: fila.signo === 1 ? 1 : -1,
    cuenta: fila.cuenta,
    nota: fila.nota,
    revierteId: fila.revierteId,
    anulacion: fila.reversion
      ? {
          id: fila.reversion.id,
          motivo: fila.reversion.nota,
          por: fila.reversion.usuario,
          en: fila.reversion.creadoEn,
        }
      : null,
    compraId: fila.compra?.id ?? null,
    usuario: fila.usuario,
    creadoEn: fila.creadoEn,
  };
}

/** Saldos por contraparte y moneda: Σ monto × signo (§7.5). Las monedas en cero no se listan. */
export async function saldosDeContrapartes(
  cliente: Pick<PrismaClient | Prisma.TransactionClient, '$queryRaw'>,
  ids?: string[],
): Promise<Map<string, { moneda: string; saldo: string }[]>> {
  const filas = await cliente.$queryRaw<FilaSaldo[]>`
    SELECT contraparte_id::text AS contraparte_id, moneda, SUM(monto * signo) AS saldo
    FROM movimiento_contraparte
    ${ids ? Prisma.sql`WHERE contraparte_id::text IN (${Prisma.join(ids.length ? ids : [''])})` : Prisma.empty}
    GROUP BY contraparte_id, moneda
    ORDER BY moneda`;
  const mapa = new Map<string, { moneda: string; saldo: string }[]>();
  for (const fila of filas) {
    if (comparar(fila.saldo.toString(), '0') === 0) continue;
    const lista = mapa.get(fila.contraparte_id) ?? [];
    lista.push({
      moneda: fila.moneda,
      saldo: montoATexto(fila.saldo.toString(), fila.moneda as Moneda),
    });
    mapa.set(fila.contraparte_id, lista);
  }
  return mapa;
}

/** Totales de todas las contrapartes por moneda: lo que me deben y lo que les debo (§5.16 B). */
export async function resumenDeContrapartes(
  cliente: Pick<PrismaClient | Prisma.TransactionClient, '$queryRaw'>,
): Promise<{ moneda: string; meDeben: string; lesDebo: string }[]> {
  const saldos = await saldosDeContrapartes(cliente);
  const totales = new Map<
    string,
    { meDeben: Prisma.Decimal | string; lesDebo: Prisma.Decimal | string }
  >();
  for (const lista of saldos.values()) {
    for (const { moneda, saldo } of lista) {
      const total = totales.get(moneda) ?? { meDeben: '0', lesDebo: '0' };
      if (comparar(saldo, '0') > 0) total.meDeben = sumar(total.meDeben, saldo);
      else total.lesDebo = sumar(total.lesDebo, saldo.replace('-', ''));
      totales.set(moneda, total);
    }
  }
  return [...totales.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([moneda, total]) => ({
      moneda,
      meDeben: montoATexto(total.meDeben, moneda as Moneda),
      lesDebo: montoATexto(total.lesDebo, moneda as Moneda),
    }));
}

export function crearServicioContrapartes({ prisma }: { prisma: PrismaClient }) {
  const auditar = (
    actor: Actor,
    contexto: ContextoPeticion,
    datos: { accion: string; entidadId: string; antes?: object; despues?: object },
    cliente: Prisma.TransactionClient | PrismaClient = prisma,
  ) =>
    registrarAuditoria(cliente, {
      ...datos,
      usuarioId: actor.id,
      entidad: 'contraparte',
      ip: contexto.ip,
      agenteUsuario: contexto.agenteUsuario,
    });

  const nombreEnUso = () =>
    errores.valorEnUso('nombre', 'Ya existe una contraparte con ese nombre.');
  const esNombreRepetido = (error: unknown) =>
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

  async function conSaldos(filas: FilaContraparte[]): Promise<ContrapartePublica[]> {
    const saldos = await saldosDeContrapartes(
      prisma,
      filas.map((fila) => fila.id),
    );
    return filas.map((fila) => ({ ...fila, saldos: saldos.get(fila.id) ?? [] }));
  }

  async function cargar(id: string): Promise<ContrapartePublica> {
    const fila = await prisma.contraparte.findUnique({
      where: { id },
      select: SELECCION_CONTRAPARTE,
    });
    if (!fila) throw errores.noEncontrado('La contraparte no existe.');
    const [publica] = await conSaldos([fila]);
    return publica as ContrapartePublica;
  }

  async function cargarMovimiento(id: string): Promise<MovimientoPublico> {
    const fila = await prisma.movimientoContraparte.findUnique({
      where: { id },
      select: SELECCION_MOVIMIENTO,
    });
    if (!fila) throw errores.noEncontrado('El movimiento no existe.');
    return aMovimientoPublico(fila);
  }

  return {
    obtener: cargar,

    async listar(filtro: {
      busqueda?: string | undefined;
      tipo?: DatosCrearContraparte['tipo'] | undefined;
      activa?: boolean | undefined;
      saldo?: 'me_deben' | 'les_debo' | undefined;
    }): Promise<ContrapartePublica[]> {
      const filas = await prisma.contraparte.findMany({
        where: {
          ...(filtro.activa === undefined ? {} : { activa: filtro.activa }),
          ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
          ...(filtro.busqueda
            ? {
                OR: [
                  { nombre: { contains: filtro.busqueda, mode: 'insensitive' } },
                  { documento: { contains: filtro.busqueda, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { nombre: 'asc' },
        select: SELECCION_CONTRAPARTE,
      });
      const publicas = await conSaldos(filas);
      if (!filtro.saldo) return publicas;
      const signo = filtro.saldo === 'me_deben' ? 1 : -1;
      return publicas.filter((c) => c.saldos.some((s) => comparar(s.saldo, '0') === signo));
    },

    resumen: () => resumenDeContrapartes(prisma),

    async opciones() {
      const [contrapartes, cuentas] = await Promise.all([
        prisma.contraparte.findMany({
          where: { activa: true },
          orderBy: { nombre: 'asc' },
          select: { id: true, nombre: true, tipo: true },
        }),
        prisma.cuentaDinero.findMany({
          where: { activa: true },
          orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
          select: { id: true, nombre: true, tipo: true, moneda: true },
        }),
      ]);
      return { contrapartes, cuentas };
    },

    async detalle(id: string) {
      const contraparte = await cargar(id);
      const filas = await prisma.movimientoContraparte.findMany({
        where: { contraparteId: id },
        orderBy: { creadoEn: 'desc' },
        take: MAXIMO_MOVIMIENTOS,
        select: SELECCION_MOVIMIENTO,
      });
      return { contraparte, movimientos: filas.map(aMovimientoPublico) };
    },

    async crear(
      datos: DatosCrearContraparte,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<ContrapartePublica> {
      try {
        const creada = await prisma.contraparte.create({
          data: {
            nombre: datos.nombre,
            tipo: datos.tipo,
            documento: datos.documento ?? null,
            telefono: datos.telefono ?? null,
            notas: datos.notas ?? null,
            creadoPorId: actor.id,
          },
          select: { id: true },
        });
        await auditar(actor, contexto, {
          accion: 'contraparte.crear',
          entidadId: creada.id,
          despues: { nombre: datos.nombre, tipo: datos.tipo },
        });
        return await cargar(creada.id);
      } catch (error) {
        if (esNombreRepetido(error)) throw nombreEnUso();
        throw error;
      }
    },

    async editar(
      id: string,
      datos: DatosEditarContraparte,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<ContrapartePublica> {
      const antes = await cargar(id);
      try {
        await prisma.contraparte.update({ where: { id }, data: datos });
      } catch (error) {
        if (esNombreRepetido(error)) throw nombreEnUso();
        throw error;
      }
      const despues = await cargar(id);
      await auditar(actor, contexto, {
        accion: 'contraparte.editar',
        entidadId: id,
        antes: {
          nombre: antes.nombre,
          tipo: antes.tipo,
          documento: antes.documento,
          telefono: antes.telefono,
          activa: antes.activa,
        },
        despues: {
          nombre: despues.nombre,
          tipo: despues.tipo,
          documento: despues.documento,
          telefono: despues.telefono,
          activa: despues.activa,
        },
      });
      return despues;
    },

    /**
     * Anota un movimiento en la cuenta corriente (§5.8). Si movió dinero físico, en la misma
     * transacción entra o sale de la cuenta del negocio (D137): la deuda y el disponible se mueven
     * por igual y no hay ingreso ni gasto (§7.5).
     */
    async registrarMovimiento(
      contraparteId: string,
      datos: DatosRegistrarMovimiento,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<{ movimiento: MovimientoPublico; repetido: boolean }> {
      const previo = await prisma.movimientoContraparte.findUnique({
        where: { claveIdempotencia: datos.claveIdempotencia },
        select: SELECCION_MOVIMIENTO,
      });
      if (previo) return repetido(previo, actor, contraparteId);

      const efecto = efectoDeMovimiento(datos.tipo);
      if (efecto.soloSistema) {
        throw errores.estadoInvalido(
          'Las compras a crédito se registran desde Compras, no como movimiento suelto.',
        );
      }
      const signo = efecto.signo ?? datos.signo;
      if (!signo) {
        throw errores.estadoInvalido(
          'Indica si el movimiento aumenta lo que te debe o lo que le debes.',
        );
      }
      if (efecto.signo !== null && datos.signo !== undefined && datos.signo !== efecto.signo) {
        throw errores.estadoInvalido('Ese tipo de movimiento ya define hacia dónde va el saldo.');
      }
      const nota = datos.nota?.trim() ? datos.nota.trim() : null;
      if ((datos.tipo === 'ajuste' || datos.tipo === 'otro') && !nota) {
        throw errores.estadoInvalido(
          datos.tipo === 'ajuste'
            ? 'Un ajuste exige el motivo en la nota.'
            : 'Un movimiento de tipo "otro" exige una nota.',
        );
      }
      if (datos.cuentaId && !efecto.admiteCuenta) {
        throw errores.estadoInvalido(
          'Un ajuste es solo una corrección de la deuda: no mueve dinero.',
        );
      }
      if (!datos.cuentaId && efecto.exigeCuenta) {
        throw errores.estadoInvalido('Indica de qué cuenta salió el anticipo.');
      }

      const [contraparte, cuenta, turno] = await Promise.all([
        prisma.contraparte.findUnique({ where: { id: contraparteId } }),
        datos.cuentaId ? prisma.cuentaDinero.findUnique({ where: { id: datos.cuentaId } }) : null,
        prisma.turno.findUnique({ where: { usuarioEnUso: actor.id }, select: { id: true } }),
      ]);
      if (!contraparte) throw errores.noEncontrado('La contraparte no existe.');
      if (!contraparte.activa) {
        throw errores.estadoInvalido(
          'La contraparte está desactivada: actívala para registrarle movimientos.',
        );
      }
      if (datos.cuentaId && !cuenta?.activa) {
        throw errores.estadoInvalido('La cuenta no existe o está desactivada.');
      }
      if (cuenta && cuenta.moneda !== datos.moneda) {
        throw errores.estadoInvalido(
          `La cuenta ${cuenta.nombre} es en ${cuenta.moneda}: el movimiento debe ser en esa moneda.`,
        );
      }
      const moneda = datos.moneda;
      const monto = montoATexto(datos.monto, moneda);
      if (comparar(monto, datos.monto) !== 0) {
        throw errores.estadoInvalido(`Los montos en ${moneda} no admiten ese número de decimales.`);
      }

      const crear = () =>
        prisma.$transaction(async (tx) => {
          const creado = await tx.movimientoContraparte.create({
            data: {
              contraparteId,
              tipo: datos.tipo,
              moneda,
              monto,
              signo,
              cuentaId: cuenta?.id ?? null,
              nota,
              turnoId: turno?.id ?? null,
              claveIdempotencia: datos.claveIdempotencia,
              usuarioId: actor.id,
            },
            select: { id: true },
          });
          if (cuenta) {
            await registrarMovimiento(tx, {
              cuentaId: cuenta.id,
              sentido: sentidoEnCuenta(signo),
              monto,
              moneda,
              origen: 'contraparte',
              movimientoContraparteId: creado.id,
              turnoId: turno?.id ?? null,
              usuarioId: actor.id,
            });
          }
          await auditar(
            actor,
            contexto,
            {
              accion: 'contraparte.movimiento',
              entidadId: contraparteId,
              despues: {
                tipo: datos.tipo,
                moneda,
                monto,
                signo,
                cuenta: cuenta?.nombre ?? null,
                movimientoId: creado.id,
              },
            },
            tx,
          );
          return creado.id;
        });

      try {
        return { movimiento: await cargarMovimiento(await crear()), repetido: false };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const ganador = await prisma.movimientoContraparte.findUnique({
            where: { claveIdempotencia: datos.claveIdempotencia },
            select: SELECCION_MOVIMIENTO,
          });
          if (ganador) return repetido(ganador, actor, contraparteId);
        }
        throw error;
      }
    },

    /**
     * Anula un movimiento agregando el contrario (la cuenta corriente es de solo inserción). Si había
     * movido dinero, el dinero vuelve por la misma cuenta. Siempre con motivo.
     */
    async anularMovimiento(
      id: string,
      motivo: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<MovimientoPublico> {
      try {
        await prisma.$transaction(async (tx) => {
          const original = await tx.movimientoContraparte.findUnique({
            where: { id },
            include: {
              reversion: { select: { id: true } },
            },
          });
          if (!original) throw errores.noEncontrado('El movimiento no existe.');
          if (original.revierteId) {
            throw errores.estadoInvalido('Ese movimiento ya es una anulación: no se anula.');
          }
          if (original.tipo === 'compra_credito') {
            throw errores.estadoInvalido(
              'Este movimiento es parte de una compra: anula la compra desde Compras.',
            );
          }
          if (original.reversion) throw errores.estadoInvalido('Ese movimiento ya fue anulado.');
          const turno = await tx.turno.findUnique({
            where: { usuarioEnUso: actor.id },
            select: { id: true },
          });
          const signo = original.signo === 1 ? -1 : 1;
          const anulacion = await tx.movimientoContraparte.create({
            data: {
              contraparteId: original.contraparteId,
              tipo: original.tipo,
              moneda: original.moneda,
              monto: original.monto,
              signo,
              cuentaId: original.cuentaId,
              nota: motivo,
              revierteId: original.id,
              turnoId: turno?.id ?? null,
              claveIdempotencia: `anulacion:${original.id}`,
              usuarioId: actor.id,
            },
            select: { id: true },
          });
          if (original.cuentaId) {
            const movimientoCuenta = await tx.movimientoCuenta.findFirst({
              where: { movimientoContraparteId: original.id },
              select: { id: true },
            });
            await registrarMovimiento(tx, {
              cuentaId: original.cuentaId,
              sentido: sentidoEnCuenta(signo),
              monto: original.monto.toString(),
              moneda: original.moneda as Moneda,
              origen: 'contraparte_anulacion',
              movimientoContraparteId: anulacion.id,
              revierteId: movimientoCuenta?.id,
              turnoId: turno?.id ?? null,
              usuarioId: actor.id,
            });
          }
          await auditar(
            actor,
            contexto,
            {
              accion: 'contraparte.anular_movimiento',
              entidadId: original.contraparteId,
              despues: { movimientoId: id, tipo: original.tipo, motivo },
            },
            tx,
          );
        });
      } catch (error) {
        // Dos anulaciones a la vez: la clave única de la anulación deja pasar solo una.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw errores.estadoInvalido('Ese movimiento ya fue anulado.');
        }
        throw error;
      }
      return cargarMovimiento(id);
    },
  };
}

function repetido(
  fila: FilaMovimiento,
  actor: Actor,
  contraparteId: string,
): { movimiento: MovimientoPublico; repetido: true } {
  if (fila.usuarioId !== actor.id || fila.contraparteId !== contraparteId) {
    throw errores.estadoInvalido('Esa clave de operación ya fue usada. Recarga la pantalla.');
  }
  return { movimiento: aMovimientoPublico(fila), repetido: true };
}
