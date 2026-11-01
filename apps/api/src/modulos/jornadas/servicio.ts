import {
  comparar,
  fijarMonto,
  finDelDia,
  inicioDelDia,
  montoATexto,
  restar,
  sumar,
  type Decimal,
  type Moneda,
} from '@cambios-jc/shared';

import type { Prisma } from '../../generated/prisma/client.js';
import { ErrorApp, errores } from '../../lib/errores.js';
import { saldoDeCuenta } from '../../lib/libro.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';
import { resumenDeContrapartes } from '../contrapartes/servicio.js';

import {
  esquemaResumen,
  type DatosCerrarJornada,
  type DetalleJornada,
  type ResumenJornada,
} from './esquemas.js';

type Cliente = PrismaClient | Prisma.TransactionClient;

interface Actor {
  id: string;
}

const MAXIMO_LISTA = 60;

const SELECCION = {
  id: true,
  fecha: true,
  estado: true,
  sucursal: { select: { id: true, nombre: true } },
  cerradaEn: true,
  cerradaPor: { select: { id: true, nombre: true } },
  ciclo: true,
  turnos: { where: { estado: 'abierto' }, select: { id: true } },
} satisfies Prisma.JornadaSelect;

type FilaJornada = Prisma.JornadaGetPayload<{ select: typeof SELECCION }>;

export type ServicioJornadas = ReturnType<typeof crearServicioJornadas>;

const diaDe = (fecha: Date) => fecha.toISOString().slice(0, 10);

function aPublica(fila: FilaJornada) {
  return {
    id: fila.id,
    fecha: diaDe(fila.fecha),
    estado: fila.estado,
    sucursal: fila.sucursal,
    cerradaEn: fila.cerradaEn,
    cerradaPor: fila.cerradaPor,
    ciclo: fila.ciclo,
    turnosAbiertos: fila.turnos.length,
  };
}

const errorDeSaldos = (mensaje: string) =>
  new ErrorApp(400, 'VALIDACION_FALLIDA', 'Los datos enviados no son válidos.', [
    { campo: 'saldos', mensaje },
  ]);

/** Suma montos de cada moneda y los muestra con los decimales de esa moneda. */
function totalesPorMoneda(items: { moneda: string; monto: Decimal | string }[]) {
  const sumas = new Map<string, Decimal>();
  for (const item of items) {
    sumas.set(item.moneda, sumar(sumas.get(item.moneda)?.toString() ?? '0', item.monto.toString()));
  }
  return [...sumas.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([moneda, total]) => ({ moneda, total: montoATexto(total, moneda as Moneda) }));
}

export function crearServicioJornadas({ prisma }: { prisma: PrismaClient }) {
  async function zonaDeLaEmpresa(): Promise<string> {
    const empresa = await prisma.empresa.findUnique({ where: { unica: true } });
    return empresa?.zonaHoraria ?? 'America/Bogota';
  }

  /**
   * Lo que debería haber en una cuenta sin caja: lo que se reportó la última vez que se arqueó (en
   * una jornada cerrada anterior) más lo que se movió desde ese cierre (D128). `null` la primera vez.
   */
  async function esperadoDeCuenta(
    cliente: Cliente,
    cuenta: { id: string; moneda: string },
    fecha: Date,
  ): Promise<Decimal | null> {
    const previo = await cliente.saldoCuentaJornada.findFirst({
      where: { cuentaId: cuenta.id, jornada: { estado: 'cerrada', fecha: { lt: fecha } } },
      orderBy: [{ jornada: { fecha: 'desc' } }, { ciclo: 'desc' }],
      include: { jornada: { select: { cerradaEn: true } } },
    });
    if (!previo?.jornada.cerradaEn) return null;
    const movido = await saldoDeCuenta(cliente, cuenta.id, { desde: previo.jornada.cerradaEn });
    return fijarMonto(sumar(previo.reportado.toString(), movido), cuenta.moneda as Moneda);
  }

  /** Bóveda, bancos y billeteras de la sucursal: lo que arquea el administrador al cerrar. */
  const cuentasSinCaja = (cliente: Cliente, sucursalId: string) =>
    cliente.cuentaDinero.findMany({
      where: { sucursalId, activa: true, cajaId: null },
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
      select: { id: true, nombre: true, tipo: true, moneda: true },
    });

  /** El resumen del día (§5.16 B y C): dinero, remesas, gastos, ganancia, contrapartes y posición. */
  async function calcularResumen(
    cliente: Cliente,
    jornada: { sucursalId: string; fecha: Date; sucursal: { id: string; nombre: string } },
    zona: string,
    reportados: Map<string, Decimal> | null,
  ): Promise<ResumenJornada> {
    const fecha = diaDe(jornada.fecha);
    const rango = { gte: inicioDelDia(fecha, zona), lte: finDelDia(fecha, zona) };
    const sucursalId = jornada.sucursalId;

    // A. Dinero disponible.
    const cuentas = await cliente.cuentaDinero.findMany({
      where: { sucursalId, activa: true },
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
      select: {
        id: true,
        nombre: true,
        tipo: true,
        moneda: true,
        cajaId: true,
        caja: { select: { id: true, nombre: true } },
      },
    });
    const disponible: ResumenJornada['disponible'] = [];
    const saldos: { moneda: string; monto: string }[] = [];
    for (const cuenta of cuentas) {
      let saldo: Decimal | null = null;
      let origen: ResumenJornada['disponible'][number]['origen'] = 'sin_dato';
      if (cuenta.cajaId) {
        const cierre = await cliente.saldoTurno.findFirst({
          where: {
            momento: 'cierre',
            moneda: cuenta.moneda,
            turno: { cajaId: cuenta.cajaId, estado: 'cerrado' },
          },
          orderBy: { turno: { cerradoEn: 'desc' } },
        });
        if (cierre) {
          saldo = fijarMonto(cierre.contado.toString(), cuenta.moneda as Moneda);
          origen = 'conteo_de_turno';
        }
      } else {
        const reportado = reportados?.get(cuenta.id);
        if (reportado) {
          saldo = reportado;
          origen = 'reportado';
        } else {
          saldo = await esperadoDeCuenta(cliente, cuenta, jornada.fecha);
          if (saldo) origen = 'esperado';
        }
      }
      if (saldo) saldos.push({ moneda: cuenta.moneda, monto: saldo.toString() });
      disponible.push({
        cuenta: { id: cuenta.id, nombre: cuenta.nombre, tipo: cuenta.tipo, moneda: cuenta.moneda },
        caja: cuenta.caja,
        saldo: saldo ? montoATexto(saldo, cuenta.moneda as Moneda) : null,
        origen,
      });
    }

    // Remesas del día en esta sucursal (por la cuenta donde entró el dinero).
    const porEstado = await cliente.operacion.groupBy({
      by: ['estado'],
      where: { creadoEn: rango, cuentaIngreso: { sucursalId } },
      _count: { _all: true },
    });
    const cuantas = (...estados: string[]) =>
      porEstado
        .filter((fila) => estados.includes(fila.estado))
        .reduce((total, fila) => total + fila._count._all, 0);

    // Movimientos del libro en las cuentas de la sucursal.
    const movimientos = await cliente.movimientoCuenta.findMany({
      where: {
        creadoEn: rango,
        origen: { in: ['remesa_ingreso', 'remesa_devolucion', 'remesa_costo'] },
        cuenta: { sucursalId },
      },
      select: { origen: true, monto: true, cuenta: { select: { moneda: true } } },
    });
    const deOrigen = (origen: string) =>
      totalesPorMoneda(
        movimientos
          .filter((m) => m.origen === origen)
          .map((m) => ({ moneda: m.cuenta.moneda, monto: m.monto })),
      );

    // Gastos y retiros que siguen en pie (los anulados no cuentan).
    const gastos = await cliente.gasto.findMany({
      where: { creadoEn: rango, anuladoEn: null, cuenta: { sucursalId } },
      select: { tipo: true, monto: true, cuenta: { select: { moneda: true } } },
    });
    const deTipo = (tipo: 'operativo' | 'retiro_dueno') =>
      totalesPorMoneda(
        gastos
          .filter((g) => g.tipo === tipo)
          .map((g) => ({ moneda: g.cuenta.moneda, monto: g.monto })),
      );

    const traslados = await cliente.traslado.count({
      where: { creadoEn: rango, anuladoEn: null, origen: { sucursalId } },
    });

    // Diferencias de arqueo de los turnos de la jornada, con su vendedor.
    const cierres = await cliente.saldoTurno.findMany({
      where: {
        momento: 'cierre',
        turno: { jornada: { sucursalId, fecha: jornada.fecha } },
        NOT: { diferencia: 0 },
      },
      include: {
        turno: {
          select: {
            id: true,
            usuario: { select: { id: true, nombre: true } },
            caja: { select: { nombre: true } },
          },
        },
      },
      orderBy: { turno: { cerradoEn: 'asc' } },
    });
    const diferenciasDeArqueo = cierres.flatMap((cierre) => {
      if (!cierre.diferencia || cierre.diferencia.isZero()) return [];
      return [
        {
          turnoId: cierre.turno.id,
          vendedor: cierre.turno.usuario,
          caja: cierre.turno.caja.nombre,
          moneda: cierre.moneda,
          diferencia: montoATexto(cierre.diferencia.toString(), cierre.moneda as Moneda),
          resultado: cierre.diferencia.isPositive() ? ('sobrante' as const) : ('faltante' as const),
          explicacion: cierre.explicacion,
        },
      ];
    });

    // Ganancia de las remesas pagadas hoy (D140, D141). Las devoluciones no se restan: una remesa
    // devuelta nunca se pagó ni generó ganancia (D142).
    const empresa = await cliente.empresa.findUnique({ where: { unica: true } });
    const local = (empresa?.monedaLocal ?? 'COP') as Moneda;
    const pagadas = await cliente.operacion.findMany({
      where: {
        estado: 'completada',
        transferencia: { completadaEn: rango },
        cuentaIngreso: { sucursalId },
      },
      select: { gananciaNeta: true, costoBancarioPesos: true },
    });
    const costeadas = pagadas.filter((p) => p.gananciaNeta !== null);
    let gananciaRemesas = sumar('0', '0');
    let costosEnPesos = sumar('0', '0');
    for (const p of costeadas) {
      gananciaRemesas = sumar(gananciaRemesas, p.gananciaNeta?.toString() ?? '0');
      costosEnPesos = sumar(costosEnPesos, p.costoBancarioPesos?.toString() ?? '0');
    }
    let gastosLocales = sumar('0', '0');
    for (const g of gastos) {
      if (g.tipo === 'operativo' && g.cuenta.moneda === local) {
        gastosLocales = sumar(gastosLocales, g.monto.toString());
      }
    }
    const ganancia = {
      moneda: local,
      remesasCosteadas: costeadas.length,
      remesasSinCosto: pagadas.length - costeadas.length,
      gananciaRemesas: montoATexto(gananciaRemesas, local),
      costosBancarios: montoATexto(costosEnPesos, local),
      gastosOperativos: montoATexto(gastosLocales, local),
      gananciaDelDia: montoATexto(restar(gananciaRemesas, gastosLocales), local),
    };

    // B. Contrapartes y posición total (§5.16, §7.6).
    const saldosContrapartes = await resumenDeContrapartes(cliente);
    const movimientosDelDia = await cliente.movimientoContraparte.count({
      where: { creadoEn: rango },
    });
    const conIncidencia = await cliente.operacion.findMany({
      where: { estado: 'con_incidencia', cuentaIngreso: { sucursalId } },
      select: { montoPesos: true, lineaNegocio: { select: { monedaOrigen: true } } },
    });
    const devolucionesPendientes = totalesPorMoneda(
      conIncidencia.map((o) => ({
        moneda: o.lineaNegocio.monedaOrigen,
        monto: o.montoPesos.toString(),
      })),
    );
    const totalDisponible = totalesPorMoneda(saldos);
    const monedasPosicion = [
      ...new Set([
        ...totalDisponible.map((t) => t.moneda),
        ...saldosContrapartes.map((c) => c.moneda),
        ...devolucionesPendientes.map((d) => d.moneda),
      ]),
    ].sort();
    const de = (lista: { moneda: string; total: string }[], moneda: string) =>
      lista.find((item) => item.moneda === moneda)?.total ?? '0';
    const posicion = monedasPosicion.map((moneda) => {
      const contraparte = saldosContrapartes.find((c) => c.moneda === moneda);
      const valor = restar(
        restar(
          sumar(de(totalDisponible, moneda), contraparte?.meDeben ?? '0'),
          contraparte?.lesDebo ?? '0',
        ),
        de(devolucionesPendientes, moneda),
      );
      return { moneda, total: montoATexto(valor, moneda as Moneda) };
    });

    return {
      fecha,
      sucursal: jornada.sucursal,
      disponible,
      totalDisponible,
      remesas: {
        registradas: porEstado.reduce((total, fila) => total + fila._count._all, 0),
        completadas: cuantas('completada'),
        anuladas: cuantas('anulada'),
        devueltas: cuantas('devuelta'),
        pendientes: cuantas('registrada', 'pago_verificado', 'en_cola', 'tomada', 'con_incidencia'),
      },
      pesosRecibidos: deOrigen('remesa_ingreso'),
      devoluciones: deOrigen('remesa_devolucion'),
      costosBancarios: deOrigen('remesa_costo'),
      gastosOperativos: deTipo('operativo'),
      retirosDelDueno: deTipo('retiro_dueno'),
      traslados,
      diferenciasDeArqueo,
      ganancia,
      contrapartes: { saldos: saldosContrapartes, movimientosDelDia },
      devolucionesPendientes,
      posicion,
    };
  }

  async function cargarFila(id: string) {
    const fila = await prisma.jornada.findUnique({ where: { id }, select: SELECCION });
    if (!fila) throw errores.noEncontrado('La jornada no existe.');
    return fila;
  }

  async function detalle(id: string): Promise<DetalleJornada> {
    const fila = await cargarFila(id);
    const zona = await zonaDeLaEmpresa();
    const sucursalId = fila.sucursal.id;
    const cruda = await prisma.jornada.findUniqueOrThrow({
      where: { id },
      select: { fecha: true, resumen: true },
    });

    const [turnosAbiertos, remesasTomadas, porArquear, eventos] = await Promise.all([
      prisma.turno.findMany({
        where: { jornadaId: id, estado: 'abierto' },
        select: {
          id: true,
          caja: { select: { nombre: true } },
          usuario: { select: { id: true, nombre: true } },
        },
      }),
      prisma.operacion.count({ where: { estado: 'tomada', cuentaIngreso: { sucursalId } } }),
      cuentasSinCaja(prisma, sucursalId),
      prisma.eventoJornada.findMany({
        where: { jornadaId: id },
        orderBy: { creadoEn: 'asc' },
        select: {
          tipo: true,
          motivo: true,
          creadoEn: true,
          usuario: { select: { id: true, nombre: true } },
        },
      }),
    ]);

    const cerrada = fila.estado === 'cerrada';
    const cuentasPorArquear = cerrada
      ? []
      : await Promise.all(
          porArquear.map(async (cuenta) => {
            const esperado = await esperadoDeCuenta(prisma, cuenta, cruda.fecha);
            return {
              cuenta,
              esperado: esperado ? montoATexto(esperado, cuenta.moneda as Moneda) : null,
            };
          }),
        );

    const reportados = cerrada
      ? await prisma.saldoCuentaJornada.findMany({
          where: { jornadaId: id, ciclo: fila.ciclo },
          include: { cuenta: { select: { id: true, nombre: true, tipo: true, moneda: true } } },
          orderBy: { cuenta: { nombre: 'asc' } },
        })
      : [];

    const resumen =
      cerrada && cruda.resumen
        ? esquemaResumen.parse(cruda.resumen)
        : await calcularResumen(
            prisma,
            { sucursalId, fecha: cruda.fecha, sucursal: fila.sucursal },
            zona,
            null,
          );

    return {
      jornada: aPublica(fila),
      pendientes: {
        turnosAbiertos: turnosAbiertos.map((t) => ({
          id: t.id,
          caja: t.caja.nombre,
          vendedor: t.usuario,
        })),
        remesasTomadas,
      },
      cuentasPorArquear,
      saldosReportados: reportados.map((saldo) => {
        const moneda = saldo.moneda as Moneda;
        return {
          cuenta: saldo.cuenta,
          esperado: saldo.esperado ? montoATexto(saldo.esperado.toString(), moneda) : null,
          reportado: montoATexto(saldo.reportado.toString(), moneda),
          diferencia: saldo.diferencia ? montoATexto(saldo.diferencia.toString(), moneda) : null,
          explicacion: saldo.explicacion,
          resultado: saldo.diferencia
            ? saldo.diferencia.isZero()
              ? ('cuadrado' as const)
              : saldo.diferencia.isPositive()
                ? ('sobrante' as const)
                : ('faltante' as const)
            : null,
        };
      }),
      resumen,
      eventos,
    };
  }

  return {
    detalle,

    async listar(filtro: {
      sucursalId?: string | undefined;
      estado?: 'abierta' | 'cerrada' | undefined;
    }) {
      const filas = await prisma.jornada.findMany({
        where: {
          ...(filtro.sucursalId ? { sucursalId: filtro.sucursalId } : {}),
          ...(filtro.estado ? { estado: filtro.estado } : {}),
        },
        orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }],
        take: MAXIMO_LISTA,
        select: SELECCION,
      });
      return filas.map(aPublica);
    },

    /**
     * Cierra la jornada de una sucursal (§5.16): exige todos los turnos cerrados y ninguna remesa
     * tomada; el administrador reporta el saldo de cada cuenta sin caja y el servidor lo compara con
     * lo esperado, sin tolerancia (D128). Guarda la foto del día y deja la jornada en solo lectura.
     */
    async cerrar(
      id: string,
      datos: DatosCerrarJornada,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<DetalleJornada> {
      const jornada = await prisma.jornada.findUnique({
        where: { id },
        include: { sucursal: { select: { id: true, nombre: true } } },
      });
      if (!jornada) throw errores.noEncontrado('La jornada no existe.');
      if (jornada.estado === 'cerrada')
        throw errores.estadoInvalido('Esa jornada ya está cerrada.');
      const zona = await zonaDeLaEmpresa();

      await prisma.$transaction(async (tx) => {
        // Cambio condicionado: dos cierres a la vez no pasan los dos.
        const cambio = await tx.jornada.updateMany({
          where: { id, estado: 'abierta' },
          data: {
            estado: 'cerrada',
            cerradaEn: new Date(),
            cerradaPorId: actor.id,
            ciclo: { increment: 1 },
          },
        });
        if (cambio.count === 0) throw errores.estadoInvalido('Esa jornada ya está cerrada.');

        const abiertos = await tx.turno.count({ where: { jornadaId: id, estado: 'abierto' } });
        if (abiertos > 0) {
          throw errores.estadoInvalido(
            `Hay ${String(abiertos)} turno(s) abierto(s): ciérralos antes de cerrar la jornada.`,
          );
        }
        const tomadas = await tx.operacion.count({
          where: { estado: 'tomada', cuentaIngreso: { sucursalId: jornada.sucursalId } },
        });
        if (tomadas > 0) {
          throw errores.estadoInvalido(
            `Hay ${String(tomadas)} remesa(s) tomada(s) por un digitador: espera a que las termine o libéralas.`,
          );
        }

        const porArquear = await cuentasSinCaja(tx, jornada.sucursalId);
        const enviados = new Set(datos.saldos.map((saldo) => saldo.cuentaId));
        if (enviados.size !== datos.saldos.length) {
          throw errorDeSaldos('Hay una cuenta repetida en los saldos.');
        }
        for (const cuenta of porArquear) {
          if (!enviados.has(cuenta.id)) {
            throw errorDeSaldos(`Falta el saldo de "${cuenta.nombre}".`);
          }
        }
        if (enviados.size !== porArquear.length) {
          throw errorDeSaldos('Hay una cuenta que no se arquea en esta jornada.');
        }

        const ciclo = jornada.ciclo + 1;
        const reportados = new Map<string, Decimal>();
        const detalleAuditoria: Record<string, unknown> = {};
        for (const cuenta of porArquear) {
          const moneda = cuenta.moneda as Moneda;
          const enviado = datos.saldos.find((saldo) => saldo.cuentaId === cuenta.id);
          if (!enviado) continue;
          const reportado = fijarMonto(enviado.reportado, moneda);
          if (comparar(reportado, enviado.reportado) !== 0) {
            throw errorDeSaldos(`Los montos en ${moneda} no admiten ese número de decimales.`);
          }
          const esperado = await esperadoDeCuenta(tx, cuenta, jornada.fecha);
          const diferencia = esperado ? restar(reportado, esperado) : null;
          const cuadra = diferencia === null || comparar(diferencia, '0') === 0;
          if (!cuadra && !enviado.explicacion) {
            throw errorDeSaldos(
              `"${cuenta.nombre}" no cuadra: explica a qué se debe la diferencia.`,
            );
          }
          await tx.saldoCuentaJornada.create({
            data: {
              jornadaId: id,
              ciclo,
              cuentaId: cuenta.id,
              moneda,
              esperado: esperado?.toString() ?? null,
              reportado: reportado.toString(),
              diferencia: diferencia?.toString() ?? null,
              explicacion: cuadra ? null : (enviado.explicacion ?? null),
            },
          });
          reportados.set(cuenta.id, reportado);
          detalleAuditoria[cuenta.nombre] = {
            esperado: esperado ? montoATexto(esperado, moneda) : null,
            reportado: montoATexto(reportado, moneda),
            diferencia: diferencia ? montoATexto(diferencia, moneda) : null,
            explicacion: cuadra ? null : enviado.explicacion,
          };
        }

        const resumen = await calcularResumen(tx, jornada, zona, reportados);
        await tx.jornada.update({ where: { id }, data: { resumen } });
        await tx.eventoJornada.create({
          data: { jornadaId: id, tipo: 'cierre', usuarioId: actor.id },
        });
        await registrarAuditoria(tx, {
          usuarioId: actor.id,
          accion: 'jornada.cerrar',
          entidad: 'jornada',
          entidadId: id,
          ip: contexto.ip,
          agenteUsuario: contexto.agenteUsuario,
          despues: {
            sucursal: jornada.sucursal.nombre,
            fecha: diaDe(jornada.fecha),
            ciclo,
            cuentas: detalleAuditoria,
          },
        });
      });
      return detalle(id);
    },

    /** Reabre una jornada cerrada. Solo el administrador, siempre con motivo (D128). */
    async reabrir(
      id: string,
      motivo: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<DetalleJornada> {
      const jornada = await prisma.jornada.findUnique({
        where: { id },
        include: { sucursal: { select: { nombre: true } } },
      });
      if (!jornada) throw errores.noEncontrado('La jornada no existe.');
      await prisma.$transaction(async (tx) => {
        const cambio = await tx.jornada.updateMany({
          where: { id, estado: 'cerrada' },
          data: { estado: 'abierta', cerradaEn: null, cerradaPorId: null },
        });
        if (cambio.count === 0) throw errores.estadoInvalido('Esa jornada no está cerrada.');
        await tx.eventoJornada.create({
          data: { jornadaId: id, tipo: 'reapertura', usuarioId: actor.id, motivo },
        });
        await registrarAuditoria(tx, {
          usuarioId: actor.id,
          accion: 'jornada.reabrir',
          entidad: 'jornada',
          entidadId: id,
          ip: contexto.ip,
          agenteUsuario: contexto.agenteUsuario,
          despues: { sucursal: jornada.sucursal.nombre, fecha: diaDe(jornada.fecha), motivo },
        });
      });
      return detalle(id);
    },
  };
}
