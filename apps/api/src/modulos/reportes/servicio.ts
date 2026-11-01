import {
  DECIMALES_TASA,
  dividir,
  finDelDia,
  inicioDelDia,
  montoATexto,
  restar,
  sumar,
  type Decimal,
  type Moneda,
} from '@cambios-jc/shared';

import type { Prisma } from '../../generated/prisma/client.js';
import { saldoDeCuenta } from '../../lib/libro.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { resumenDeContrapartes } from '../contrapartes/servicio.js';
import { fechaEnZona } from '../turnos/servicio.js';

import type { NombreReporte, TablaReporte } from './esquemas.js';

const POR_PAGINA = 50;

/** Tabla → CSV (UTF-8 con BOM para que Excel lea bien las tildes, comillas en todo, CRLF). */
export function aCsv(tabla: TablaReporte): string {
  const celda = (valor: string) => `"${valor.replaceAll('"', '""')}"`;
  return (
    '\uFEFF' +
    [tabla.columnas, ...tabla.filas].map((fila) => fila.map(celda).join(',')).join('\r\n') +
    '\r\n'
  );
}

const cero = (): Decimal => sumar('0', '0');
const pesos = (valor: Decimal | string) => montoATexto(valor, 'COP');

export type ServicioReportes = ReturnType<typeof crearServicioReportes>;

export function crearServicioReportes({ prisma }: { prisma: PrismaClient }) {
  async function zona(): Promise<string> {
    const empresa = await prisma.empresa.findUnique({ where: { unica: true } });
    return empresa?.zonaHoraria ?? 'America/Bogota';
  }

  async function rango(desde: string, hasta: string) {
    const z = await zona();
    return { z, rango: { gte: inicioDelDia(desde, z), lte: finDelDia(hasta, z) } };
  }

  /** Ganancia neta del periodo: remesas pagadas + ventas de divisa − gastos operativos (D141, D146). */
  async function gananciaEntre(rangoFechas: { gte: Date; lte: Date }) {
    const [remesas, divisas, gastos] = await Promise.all([
      prisma.operacion.aggregate({
        where: { estado: 'completada', transferencia: { completadaEn: rangoFechas } },
        _sum: { gananciaNeta: true },
        _count: { _all: true },
      }),
      prisma.operacionDivisa.aggregate({
        where: { creadoEn: rangoFechas, anuladoEn: null },
        _sum: { ganancia: true },
      }),
      prisma.gasto.aggregate({
        where: {
          creadoEn: rangoFechas,
          anuladoEn: null,
          tipo: 'operativo',
          cuenta: { moneda: 'COP' },
        },
        _sum: { monto: true },
      }),
    ]);
    const bruta = sumar(
      remesas._sum.gananciaNeta?.toString() ?? '0',
      divisas._sum.ganancia?.toString() ?? '0',
    );
    return {
      remesas: remesas._count._all,
      ganancia: restar(bruta, gastos._sum.monto?.toString() ?? '0'),
    };
  }

  const reportes: Record<
    NombreReporte,
    (r: { gte: Date; lte: Date }, z: string) => Promise<TablaReporte>
  > = {
    async ganancia(r, z) {
      const [remesas, divisas, gastos] = await Promise.all([
        prisma.operacion.findMany({
          where: { estado: 'completada', transferencia: { completadaEn: r } },
          select: {
            gananciaNeta: true,
            costoBancarioPesos: true,
            transferencia: { select: { completadaEn: true } },
          },
        }),
        prisma.operacionDivisa.findMany({
          where: { creadoEn: r, anuladoEn: null, tipo: 'venta' },
          select: { ganancia: true, creadoEn: true },
        }),
        prisma.gasto.findMany({
          where: { creadoEn: r, anuladoEn: null, tipo: 'operativo', cuenta: { moneda: 'COP' } },
          select: { monto: true, creadoEn: true },
        }),
      ]);
      const dias = new Map<
        string,
        { remesas: number; gRemesas: Decimal; costos: Decimal; gDivisas: Decimal; gastos: Decimal }
      >();
      const de = (fecha: Date) => {
        const clave = fechaEnZona(fecha, z);
        const actual = dias.get(clave) ?? {
          remesas: 0,
          gRemesas: cero(),
          costos: cero(),
          gDivisas: cero(),
          gastos: cero(),
        };
        dias.set(clave, actual);
        return actual;
      };
      for (const o of remesas) {
        const d = de(o.transferencia?.completadaEn ?? new Date(0));
        d.remesas += 1;
        d.gRemesas = sumar(d.gRemesas, o.gananciaNeta?.toString() ?? '0');
        d.costos = sumar(d.costos, o.costoBancarioPesos?.toString() ?? '0');
      }
      for (const v of divisas) {
        const d = de(v.creadoEn);
        d.gDivisas = sumar(d.gDivisas, v.ganancia?.toString() ?? '0');
      }
      for (const g of gastos) {
        const d = de(g.creadoEn);
        d.gastos = sumar(d.gastos, g.monto.toString());
      }
      return {
        titulo: 'Ganancia neta por día',
        columnas: [
          'Fecha',
          'Remesas pagadas',
          'Ganancia remesas (COP)',
          'Costos bancarios (COP)',
          'Ganancia divisas (COP)',
          'Gastos operativos (COP)',
          'Ganancia del día (COP)',
        ],
        filas: [...dias.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([fecha, d]) => [
            fecha,
            String(d.remesas),
            pesos(d.gRemesas),
            pesos(d.costos),
            pesos(d.gDivisas),
            pesos(d.gastos),
            pesos(restar(sumar(d.gRemesas, d.gDivisas), d.gastos)),
          ]),
      };
    },

    async top_clientes(r) {
      const grupos = await prisma.operacion.groupBy({
        by: ['remitenteId'],
        where: { creadoEn: r, estado: { notIn: ['anulada', 'devuelta'] } },
        _sum: { montoPesos: true },
        _count: { _all: true },
        orderBy: { _sum: { montoPesos: 'desc' } },
        take: 20,
      });
      const clientes = await prisma.cliente.findMany({
        where: { id: { in: grupos.map((g) => g.remitenteId) } },
        select: { id: true, nombre: true, tipoDocumento: true, numeroDocumento: true },
      });
      return {
        titulo: 'Clientes que más envían',
        columnas: ['Cliente', 'Documento', 'Remesas', 'Total enviado (COP)'],
        filas: grupos.map((g) => {
          const c = clientes.find((x) => x.id === g.remitenteId);
          return [
            c?.nombre ?? '',
            c ? `${c.tipoDocumento} ${c.numeroDocumento}` : '',
            String(g._count._all),
            pesos(g._sum.montoPesos?.toString() ?? '0'),
          ];
        }),
      };
    },

    async proveedores(r) {
      const grupos = await prisma.compraDivisa.groupBy({
        by: ['contraparteId', 'moneda'],
        where: { creadoEn: r, anuladoEn: null },
        _sum: { cantidad: true, montoPesos: true },
        _count: { _all: true },
      });
      const contrapartes = await prisma.contraparte.findMany({
        where: { id: { in: grupos.map((g) => g.contraparteId) } },
        select: { id: true, nombre: true },
      });
      return {
        titulo: 'Volumen comprado por proveedor',
        columnas: [
          'Proveedor',
          'Moneda',
          'Compras',
          'Cantidad',
          'Pesos pagados',
          'Tasa promedio ponderada',
        ],
        filas: grupos.map((g) => {
          const cantidad = g._sum.cantidad?.toString() ?? '0';
          const pagado = g._sum.montoPesos?.toString() ?? '0';
          return [
            contrapartes.find((c) => c.id === g.contraparteId)?.nombre ?? '',
            g.moneda,
            String(g._count._all),
            montoATexto(cantidad, g.moneda as Moneda),
            pesos(pagado),
            cantidad === '0' ? '' : dividir(pagado, cantidad).toFixed(DECIMALES_TASA),
          ];
        }),
      };
    },

    async arqueo(r) {
      const saldos = await prisma.saldoTurno.findMany({
        where: { momento: 'cierre', turno: { cerradoEn: r }, NOT: { diferencia: 0 } },
        select: {
          moneda: true,
          diferencia: true,
          turno: { select: { usuario: { select: { id: true, nombre: true } } } },
        },
      });
      const grupos = new Map<
        string,
        { vendedor: string; moneda: string; veces: number; sobrante: Decimal; faltante: Decimal }
      >();
      for (const s of saldos) {
        if (!s.diferencia) continue;
        const clave = `${s.turno.usuario.id}|${s.moneda}`;
        const g = grupos.get(clave) ?? {
          vendedor: s.turno.usuario.nombre,
          moneda: s.moneda,
          veces: 0,
          sobrante: cero(),
          faltante: cero(),
        };
        g.veces += 1;
        if (s.diferencia.isPositive()) g.sobrante = sumar(g.sobrante, s.diferencia.toString());
        else g.faltante = sumar(g.faltante, s.diferencia.abs().toString());
        grupos.set(clave, g);
      }
      return {
        titulo: 'Diferencias de arqueo por vendedor',
        columnas: ['Vendedor', 'Moneda', 'Turnos con diferencia', 'Sobrantes', 'Faltantes'],
        filas: [...grupos.values()].map((g) => [
          g.vendedor,
          g.moneda,
          String(g.veces),
          montoATexto(g.sobrante, g.moneda as Moneda),
          montoATexto(g.faltante, g.moneda as Moneda),
        ]),
      };
    },

    async tasas_manuales(r, z) {
      const [remesas, divisas] = await Promise.all([
        prisma.operacion.findMany({
          where: { creadoEn: r, motivoTasa: { not: null } },
          orderBy: { creadoEn: 'asc' },
          select: {
            numeroComprobante: true,
            creadoEn: true,
            tasaCalculada: true,
            tasaUsada: true,
            motivoTasa: true,
            creadoPor: { select: { nombre: true } },
          },
        }),
        prisma.operacionDivisa.findMany({
          where: { creadoEn: r, motivoTasa: { not: null } },
          orderBy: { creadoEn: 'asc' },
          select: {
            numeroComprobante: true,
            creadoEn: true,
            tasaCalculada: true,
            tasaUsada: true,
            motivoTasa: true,
            creadoPor: { select: { nombre: true } },
          },
        }),
      ]);
      const fila = (tipo: string) => (o: (typeof remesas)[number]) => [
        fechaEnZona(o.creadoEn, z),
        String(o.numeroComprobante),
        tipo,
        o.creadoPor.nombre,
        o.tasaCalculada.toFixed(DECIMALES_TASA),
        o.tasaUsada.toFixed(DECIMALES_TASA),
        o.motivoTasa ?? '',
      ];
      return {
        titulo: 'Uso de tasas manuales',
        columnas: [
          'Fecha',
          'Comprobante',
          'Tipo',
          'Usuario',
          'Tasa publicada',
          'Tasa usada',
          'Motivo',
        ],
        filas: [...remesas.map(fila('Remesa')), ...divisas.map(fila('Divisa'))],
      };
    },

    async costos_bancarios(r) {
      const grupos = await prisma.operacion.findMany({
        where: { estado: 'completada', transferencia: { completadaEn: r } },
        select: {
          costoBancarioPesos: true,
          transferencia: {
            select: { costoBancario: true, cuentaOrigen: { select: { id: true, nombre: true } } },
          },
        },
      });
      const porCuenta = new Map<
        string,
        { nombre: string; pagos: number; ves: Decimal; cop: Decimal }
      >();
      for (const o of grupos) {
        const cuenta = o.transferencia?.cuentaOrigen;
        if (!cuenta) continue;
        const g = porCuenta.get(cuenta.id) ?? {
          nombre: cuenta.nombre,
          pagos: 0,
          ves: cero(),
          cop: cero(),
        };
        g.pagos += 1;
        g.ves = sumar(g.ves, o.transferencia?.costoBancario?.toString() ?? '0');
        g.cop = sumar(g.cop, o.costoBancarioPesos?.toString() ?? '0');
        porCuenta.set(cuenta.id, g);
      }
      return {
        titulo: 'Costos bancarios por cuenta de pago',
        columnas: ['Cuenta', 'Pagos', 'Costo (VES)', 'Costo en pesos (COP)'],
        filas: [...porCuenta.values()].map((g) => [
          g.nombre,
          String(g.pagos),
          montoATexto(g.ves, 'VES'),
          pesos(g.cop),
        ]),
      };
    },
  };

  return {
    async reporte(nombre: NombreReporte, desde: string, hasta: string): Promise<TablaReporte> {
      const { z, rango: r } = await rango(desde, hasta);
      return reportes[nombre](r, z);
    },

    /** Tablero del dueño (§5.17): ganancia de hoy y del mes, liquidez, deudas y alertas abiertas. */
    async tablero() {
      const z = await zona();
      const hoy = fechaEnZona(new Date(), z);
      const [delDia, delMes] = await Promise.all([
        gananciaEntre({ gte: inicioDelDia(hoy, z), lte: finDelDia(hoy, z) }),
        gananciaEntre({ gte: inicioDelDia(`${hoy.slice(0, 7)}-01`, z), lte: finDelDia(hoy, z) }),
      ]);
      // Liquidez (§7.4): disponible en cuentas de la moneda destino frente a lo comprometido en cola.
      const lineas = await prisma.lineaNegocio.findMany({
        where: { clase: 'remesa', activa: true },
        select: { monedaDestino: true },
        distinct: ['monedaDestino'],
      });
      const liquidez = [];
      for (const { monedaDestino } of lineas) {
        const moneda = monedaDestino as Moneda;
        const cuentas = await prisma.cuentaDinero.findMany({
          where: { moneda, activa: true },
          select: { id: true },
        });
        let disponible = cero();
        for (const c of cuentas) disponible = sumar(disponible, await saldoDeCuenta(prisma, c.id));
        const comprometido = await prisma.operacion.aggregate({
          where: { estado: { in: ['en_cola', 'tomada'] }, lineaNegocio: { monedaDestino } },
          _sum: { montoBolivares: true },
        });
        const enCola = comprometido._sum.montoBolivares?.toString() ?? '0';
        liquidez.push({
          moneda,
          disponible: montoATexto(disponible, moneda),
          comprometido: montoATexto(enCola, moneda),
          libre: montoATexto(restar(disponible, enCola), moneda),
        });
      }
      return {
        moneda: 'COP',
        gananciaHoy: pesos(delDia.ganancia),
        gananciaMes: pesos(delMes.ganancia),
        remesasHoy: await prisma.operacion.count({
          where: { creadoEn: { gte: inicioDelDia(hoy, z) } },
        }),
        liquidez,
        contrapartes: await resumenDeContrapartes(prisma),
        alertasAbiertas: await prisma.alertaCumplimiento.count({ where: { estado: 'abierta' } }),
      };
    },

    /**
     * Búsqueda avanzada en el histórico (§5.17): remesas y operaciones de divisas por comprobante,
     * documento o nombre, usuario, estado y fecha (igual, mayor, menor o entre).
     */
    async buscar(filtro: {
      tipo?: 'remesa' | 'divisa' | undefined;
      comprobante?: number | undefined;
      texto?: string | undefined;
      usuarioId?: string | undefined;
      estado?: string | undefined;
      comparacion?: 'igual' | 'mayor' | 'menor' | 'entre' | undefined;
      fecha?: string | undefined;
      fechaHasta?: string | undefined;
      pagina: number;
    }) {
      const z = await zona();
      let creadoEn: { gte?: Date; lte?: Date } | undefined;
      if (filtro.fecha && filtro.comparacion) {
        const inicio = inicioDelDia(filtro.fecha, z);
        const fin = finDelDia(filtro.fecha, z);
        creadoEn =
          filtro.comparacion === 'igual'
            ? { gte: inicio, lte: fin }
            : filtro.comparacion === 'mayor'
              ? { gte: inicio }
              : filtro.comparacion === 'menor'
                ? { lte: fin }
                : { gte: inicio, lte: finDelDia(filtro.fechaHasta ?? filtro.fecha, z) };
      }
      const toma = filtro.pagina * POR_PAGINA + 1;
      const texto = filtro.texto;
      const personaCoincide = texto
        ? {
            OR: [
              { nombre: { contains: texto, mode: 'insensitive' as const } },
              { numeroDocumento: { contains: texto } },
            ],
          }
        : undefined;

      const remesas =
        filtro.tipo === 'divisa'
          ? []
          : await prisma.operacion.findMany({
              where: {
                ...(filtro.comprobante ? { numeroComprobante: filtro.comprobante } : {}),
                ...(filtro.usuarioId ? { creadoPorId: filtro.usuarioId } : {}),
                ...(filtro.estado
                  ? { estado: filtro.estado as Prisma.OperacionWhereInput['estado'] }
                  : {}),
                ...(creadoEn ? { creadoEn } : {}),
                ...(personaCoincide
                  ? {
                      OR: [
                        { remitente: personaCoincide },
                        { transferencia: { medioPago: { cliente: personaCoincide } } },
                      ],
                    }
                  : {}),
              },
              orderBy: { creadoEn: 'desc' },
              take: toma,
              select: {
                id: true,
                numeroComprobante: true,
                creadoEn: true,
                estado: true,
                montoPesos: true,
                montoBolivares: true,
                tasaUsada: true,
                remitente: { select: { nombre: true, numeroDocumento: true } },
                transferencia: {
                  select: { medioPago: { select: { cliente: { select: { nombre: true } } } } },
                },
                creadoPor: { select: { nombre: true } },
              },
            });
      const divisas =
        filtro.tipo === 'remesa' ||
        (filtro.estado && !['vigente', 'anulada'].includes(filtro.estado))
          ? []
          : await prisma.operacionDivisa.findMany({
              where: {
                ...(filtro.comprobante ? { numeroComprobante: filtro.comprobante } : {}),
                ...(filtro.usuarioId ? { creadoPorId: filtro.usuarioId } : {}),
                ...(filtro.estado === 'anulada' ? { anuladoEn: { not: null } } : {}),
                ...(filtro.estado === 'vigente' ? { anuladoEn: null } : {}),
                ...(creadoEn ? { creadoEn } : {}),
                ...(texto
                  ? {
                      OR: [
                        { clienteNombre: { contains: texto, mode: 'insensitive' as const } },
                        { clienteDocumento: { contains: texto } },
                      ],
                    }
                  : {}),
              },
              orderBy: { creadoEn: 'desc' },
              take: toma,
              select: {
                id: true,
                numeroComprobante: true,
                creadoEn: true,
                anuladoEn: true,
                moneda: true,
                montoDivisa: true,
                montoPesos: true,
                tasaUsada: true,
                clienteNombre: true,
                creadoPor: { select: { nombre: true } },
              },
            });

      const todos = [
        ...remesas.map((r) => ({
          tipo: 'remesa' as const,
          id: r.id,
          numeroComprobante: r.numeroComprobante,
          fecha: r.creadoEn,
          estado: r.estado,
          cliente: `${r.remitente.nombre} (${r.remitente.numeroDocumento})`,
          beneficiario: r.transferencia?.medioPago.cliente.nombre ?? null,
          usuario: r.creadoPor.nombre,
          montoLocal: r.montoPesos.toFixed(2),
          montoExtranjero: r.montoBolivares.toFixed(3),
          monedaExtranjera: 'VES',
          tasa: r.tasaUsada.toFixed(DECIMALES_TASA),
        })),
        ...divisas.map((d) => ({
          tipo: 'divisa' as const,
          id: d.id,
          numeroComprobante: d.numeroComprobante,
          fecha: d.creadoEn,
          estado: d.anuladoEn ? 'anulada' : 'vigente',
          cliente: d.clienteNombre ?? '',
          beneficiario: null,
          usuario: d.creadoPor.nombre,
          montoLocal: d.montoPesos.toFixed(2),
          montoExtranjero: d.montoDivisa.toFixed(2),
          monedaExtranjera: d.moneda,
          tasa: d.tasaUsada.toFixed(DECIMALES_TASA),
        })),
      ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
      const inicio = (filtro.pagina - 1) * POR_PAGINA;
      return {
        resultados: todos.slice(inicio, inicio + POR_PAGINA),
        pagina: filtro.pagina,
        hayMas: todos.length > inicio + POR_PAGINA,
      };
    },
  };
}
