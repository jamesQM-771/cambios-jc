import {
  fijarMonto,
  montoATexto,
  multiplicar,
  restar,
  sumar,
  type Moneda,
} from '@cambios-jc/shared';

import { Prisma } from '../../generated/prisma/client.js';
import { ErrorApp, errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type { DatosAbrirTurno, TurnoPublico } from './esquemas.js';

const SELECCION = {
  id: true,
  caja: { select: { id: true, nombre: true } },
  usuario: { select: { id: true, nombre: true } },
  estado: true,
  abiertoEn: true,
  cerradoEn: true,
  jornada: { select: { id: true, fecha: true } },
  saldos: { orderBy: [{ momento: 'asc' }, { moneda: 'asc' }] },
  conteos: { orderBy: [{ momento: 'asc' }, { moneda: 'asc' }, { valor: 'desc' }] },
} satisfies Prisma.TurnoSelect;

type FilaTurno = Prisma.TurnoGetPayload<{ select: typeof SELECCION }>;

interface Actor {
  id: string;
}

export type ServicioTurnos = ReturnType<typeof crearServicioTurnos>;

const errorConteo = (campo: string, mensaje: string): ErrorApp =>
  new ErrorApp(400, 'VALIDACION_FALLIDA', 'Los datos enviados no son válidos.', [
    { campo, mensaje },
  ]);

/** "2026-10-21" en la zona horaria de la empresa: la jornada es un día del local, no del servidor. */
export function fechaEnZona(instante: Date, zona: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

function aPublico(fila: FilaTurno): TurnoPublico {
  return {
    id: fila.id,
    caja: fila.caja,
    usuario: fila.usuario,
    estado: fila.estado,
    abiertoEn: fila.abiertoEn,
    cerradoEn: fila.cerradoEn,
    jornada: { id: fila.jornada.id, fecha: fila.jornada.fecha.toISOString().slice(0, 10) },
    saldos: fila.saldos.map((saldo) => {
      const moneda = saldo.moneda as Moneda;
      return {
        momento: saldo.momento,
        moneda: saldo.moneda,
        esperado: saldo.esperado ? montoATexto(saldo.esperado.toString(), moneda) : null,
        contado: montoATexto(saldo.contado.toString(), moneda),
        diferencia: saldo.diferencia ? montoATexto(saldo.diferencia.toString(), moneda) : null,
        explicacion: saldo.explicacion,
      };
    }),
    conteos: fila.conteos.map((conteo) => ({
      momento: conteo.momento,
      moneda: conteo.moneda,
      valor: conteo.valor.toFixed(3),
      cantidad: conteo.cantidad,
    })),
  };
}

export function crearServicioTurnos({ prisma }: { prisma: PrismaClient }) {
  async function cargar(id: string): Promise<TurnoPublico> {
    const fila = await prisma.turno.findUnique({ where: { id }, select: SELECCION });
    if (!fila) throw errores.noEncontrado('El turno no existe.');
    return aPublico(fila);
  }

  async function turnoAbiertoDe(usuarioId: string): Promise<TurnoPublico | null> {
    const fila = await prisma.turno.findFirst({
      where: { usuarioId, estado: 'abierto' },
      select: SELECCION,
    });
    return fila ? aPublico(fila) : null;
  }

  return {
    obtener: cargar,
    actual: turnoAbiertoDe,

    async listar(filtro: {
      estado?: 'abierto' | 'cerrado' | undefined;
      cajaId?: string | undefined;
    }) {
      const filas = await prisma.turno.findMany({
        where: {
          ...(filtro.estado ? { estado: filtro.estado } : {}),
          ...(filtro.cajaId ? { cajaId: filtro.cajaId } : {}),
        },
        orderBy: { abiertoEn: 'desc' },
        take: 100,
        select: SELECCION,
      });
      return filas.map(aPublico);
    },

    /** Cajas con su efectivo y las denominaciones, para armar la pantalla de apertura. */
    async opciones(usuarioId: string) {
      const [cajas, denominaciones, abiertos, miTurno] = await Promise.all([
        prisma.caja.findMany({
          where: { activa: true, sucursal: { activa: true } },
          orderBy: [{ sucursal: { nombre: 'asc' } }, { nombre: 'asc' }],
          select: {
            id: true,
            nombre: true,
            sucursal: { select: { id: true, nombre: true } },
            cuentas: {
              where: { activa: true, tipo: 'caja' },
              orderBy: { moneda: 'asc' },
              select: { id: true, nombre: true, moneda: true },
            },
          },
        }),
        prisma.denominacion.findMany({
          where: { activa: true },
          orderBy: { valor: 'desc' },
          select: { id: true, moneda: true, valor: true },
        }),
        prisma.turno.findMany({
          where: { estado: 'abierto' },
          select: { cajaId: true, usuario: { select: { nombre: true } } },
        }),
        turnoAbiertoDe(usuarioId),
      ]);
      return {
        cajas: cajas.map((caja) => ({
          id: caja.id,
          nombre: caja.nombre,
          sucursal: caja.sucursal,
          ocupadaPor: abiertos.find((t) => t.cajaId === caja.id)?.usuario.nombre ?? null,
          monedas: caja.cuentas.map((cuenta) => ({
            moneda: cuenta.moneda,
            cuenta: { id: cuenta.id, nombre: cuenta.nombre },
            denominaciones: denominaciones
              .filter((d) => d.moneda === cuenta.moneda)
              .map((d) => ({ id: d.id, valor: d.valor.toFixed(3) })),
          })),
        })),
        miTurno,
      };
    },

    /**
     * Abre un turno: cuenta el efectivo de la caja por denominación y lo compara con el último
     * cierre de esa caja (la diferencia queda registrada, §5.16). Una caja y una persona solo pueden
     * tener un turno abierto a la vez (D117), y el día del local se abre solo con el primero (D118).
     */
    async abrir(
      datos: DatosAbrirTurno,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<TurnoPublico> {
      const caja = await prisma.caja.findUnique({
        where: { id: datos.cajaId },
        include: {
          sucursal: true,
          cuentas: { where: { activa: true, tipo: 'caja' } },
        },
      });
      if (!caja?.activa || !caja.sucursal.activa) {
        throw errores.estadoInvalido('La caja no existe o está desactivada.');
      }
      if (caja.cuentas.length === 0) {
        throw errores.estadoInvalido(
          'Esta caja no tiene una cuenta de efectivo: pídele al administrador que la configure.',
        );
      }

      // El conteo debe cubrir exactamente las monedas de esa caja: ni una menos ni una de más.
      const monedasCaja = new Set(caja.cuentas.map((cuenta) => cuenta.moneda));
      const monedasContadas = datos.conteos.map((conteo) => conteo.moneda);
      if (new Set(monedasContadas).size !== monedasContadas.length) {
        throw errorConteo('conteos', 'Hay una moneda repetida en el conteo.');
      }
      for (const moneda of monedasContadas) {
        if (!monedasCaja.has(moneda)) {
          throw errorConteo('conteos', `Esta caja no maneja efectivo en ${moneda}.`);
        }
      }
      for (const moneda of monedasCaja) {
        if (!monedasContadas.includes(moneda as Moneda)) {
          throw errorConteo('conteos', `Falta contar el efectivo en ${moneda}.`);
        }
      }

      const denominaciones = await prisma.denominacion.findMany({
        where: { moneda: { in: [...monedasCaja] }, activa: true },
      });
      const conteos = datos.conteos.map((conteo) => {
        const vistas = new Set<string>();
        let total = fijarMonto('0', conteo.moneda);
        const lineas = conteo.lineas.map((linea) => {
          const denominacion = denominaciones.find(
            (d) => d.id === linea.denominacionId && d.moneda === conteo.moneda,
          );
          if (!denominacion) {
            throw errorConteo(
              'conteos',
              `Una de las denominaciones no existe, está desactivada o no es de ${conteo.moneda}.`,
            );
          }
          if (vistas.has(denominacion.id)) {
            throw errorConteo('conteos', 'Hay una denominación repetida en el conteo.');
          }
          vistas.add(denominacion.id);
          total = sumar(total, multiplicar(denominacion.valor.toString(), String(linea.cantidad)));
          return { denominacion, cantidad: linea.cantidad };
        });
        return { moneda: conteo.moneda, lineas, total: fijarMonto(total, conteo.moneda) };
      });

      const empresa = await prisma.empresa.findUnique({ where: { unica: true } });
      const zona = empresa?.zonaHoraria ?? 'America/Bogota';

      try {
        const id = await prisma.$transaction(async (tx) => {
          // Mensajes claros antes de depender de los candados únicos.
          const cajaOcupada = await tx.turno.findFirst({
            where: { cajaId: caja.id, estado: 'abierto' },
            select: { usuario: { select: { nombre: true } } },
          });
          if (cajaOcupada) {
            throw errores.estadoInvalido(
              `Esta caja ya tiene un turno abierto (${cajaOcupada.usuario.nombre}).`,
            );
          }
          if (await tx.turno.findFirst({ where: { usuarioId: actor.id, estado: 'abierto' } })) {
            throw errores.estadoInvalido(
              'Ya tienes un turno abierto: ciérralo antes de abrir otro.',
            );
          }

          const fecha = new Date(`${fechaEnZona(new Date(), zona)}T00:00:00Z`);
          await tx.jornada.createMany({
            data: [{ sucursalId: caja.sucursalId, fecha }],
            skipDuplicates: true,
          });
          const jornada = await tx.jornada.findUniqueOrThrow({
            where: { sucursalId_fecha: { sucursalId: caja.sucursalId, fecha } },
          });
          if (jornada.estado === 'cerrada') {
            throw errores.estadoInvalido(
              'La jornada de hoy ya está cerrada: el administrador debe reabrirla.',
            );
          }

          const turno = await tx.turno.create({
            data: {
              cajaId: caja.id,
              usuarioId: actor.id,
              jornadaId: jornada.id,
              cajaEnUso: caja.id,
              usuarioEnUso: actor.id,
            },
          });

          for (const conteo of conteos) {
            // Lo esperado al abrir es lo que se contó al cerrar el turno anterior de esta caja.
            const anterior = await tx.saldoTurno.findFirst({
              where: { momento: 'cierre', moneda: conteo.moneda, turno: { cajaId: caja.id } },
              orderBy: { turno: { cerradoEn: 'desc' } },
            });
            const esperado = anterior
              ? fijarMonto(anterior.contado.toString(), conteo.moneda)
              : null;
            await tx.saldoTurno.create({
              data: {
                turnoId: turno.id,
                momento: 'apertura',
                moneda: conteo.moneda,
                esperado: esperado?.toString() ?? null,
                contado: conteo.total.toString(),
                diferencia: esperado
                  ? fijarMonto(restar(conteo.total, esperado), conteo.moneda).toString()
                  : null,
              },
            });
            const conCantidad = conteo.lineas.filter((linea) => linea.cantidad > 0);
            if (conCantidad.length > 0) {
              await tx.conteoTurno.createMany({
                data: conCantidad.map((linea) => ({
                  turnoId: turno.id,
                  momento: 'apertura' as const,
                  moneda: conteo.moneda,
                  denominacionId: linea.denominacion.id,
                  valor: linea.denominacion.valor,
                  cantidad: linea.cantidad,
                })),
              });
            }
          }

          await registrarAuditoria(tx, {
            usuarioId: actor.id,
            accion: 'turno.abrir',
            entidad: 'turno',
            entidadId: turno.id,
            ip: contexto.ip,
            agenteUsuario: contexto.agenteUsuario,
            despues: {
              caja: caja.nombre,
              jornada: fecha.toISOString().slice(0, 10),
              contado: Object.fromEntries(
                conteos.map((c) => [c.moneda, montoATexto(c.total, c.moneda)]),
              ),
            },
          });
          return turno.id;
        });
        return await cargar(id);
      } catch (error) {
        // Dos aperturas a la vez: los candados únicos dejan pasar solo una.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw errores.estadoInvalido(
            'Esa caja o tu usuario ya tienen un turno abierto. Recarga la pantalla.',
          );
        }
        throw error;
      }
    },
  };
}
