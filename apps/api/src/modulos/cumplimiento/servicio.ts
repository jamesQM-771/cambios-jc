import { finDelDia, inicioDelDia } from '@cambios-jc/shared';

import type { Prisma } from '../../generated/prisma/client.js';
import { acumuladosDe } from '../../lib/cumplimiento.js';
import { errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

interface Actor {
  id: string;
}

const SELECCION_ALERTA = {
  id: true,
  tipo: true,
  estado: true,
  cliente: { select: { id: true, nombre: true, tipoDocumento: true, numeroDocumento: true } },
  operacion: { select: { id: true, numeroComprobante: true } },
  detalle: true,
  justificacion: true,
  resueltaPor: { select: { id: true, nombre: true } },
  resueltaEn: true,
  creadoEn: true,
} satisfies Prisma.AlertaCumplimientoSelect;

type FilaAlerta = Prisma.AlertaCumplimientoGetPayload<{ select: typeof SELECCION_ALERTA }>;

const aAlerta = (fila: FilaAlerta) => ({
  ...fila,
  detalle: (fila.detalle ?? {}) as Record<string, unknown>,
});

const SELECCION_ENTRADA = {
  id: true,
  fuente: true,
  nombre: true,
  numeroDocumento: true,
  nota: true,
  activa: true,
  creadoEn: true,
} satisfies Prisma.EntradaListaRestrictivaSelect;

/** Un campo de texto para CSV: entre comillas, con las comillas internas duplicadas. */
const celda = (valor: string | number | null) => `"${String(valor ?? '').replaceAll('"', '""')}"`;

export type ServicioCumplimiento = ReturnType<typeof crearServicioCumplimiento>;

export function crearServicioCumplimiento({ prisma }: { prisma: PrismaClient }) {
  const auditar = (
    actor: Actor,
    contexto: ContextoPeticion,
    datos: { accion: string; entidad: string; entidadId: string; antes?: object; despues?: object },
  ) =>
    registrarAuditoria(prisma, {
      ...datos,
      usuarioId: actor.id,
      ip: contexto.ip,
      agenteUsuario: contexto.agenteUsuario,
    });

  async function parametros() {
    const fila = await prisma.parametrosCumplimiento.upsert({
      where: { unica: true },
      update: {},
      create: {},
    });
    return {
      umbralFichaMensual: fila.umbralFichaMensual?.toFixed(2) ?? null,
      fraccionamientoCantidad: fila.fraccionamientoCantidad,
      fraccionamientoMontoMaximo: fila.fraccionamientoMontoMaximo?.toFixed(2) ?? null,
      concentracionRemitentes: fila.concentracionRemitentes,
    };
  }

  async function cargarAlerta(id: string) {
    const fila = await prisma.alertaCumplimiento.findUnique({
      where: { id },
      select: SELECCION_ALERTA,
    });
    if (!fila) throw errores.noEncontrado('La alerta no existe.');
    return aAlerta(fila);
  }

  return {
    parametros,

    async guardarParametros(
      datos: {
        umbralFichaMensual: string | null;
        fraccionamientoCantidad: number | null;
        fraccionamientoMontoMaximo: string | null;
        concentracionRemitentes: number | null;
      },
      actor: Actor,
      contexto: ContextoPeticion,
    ) {
      const antes = await parametros();
      await prisma.parametrosCumplimiento.update({
        where: { unica: true },
        data: { ...datos, actualizadoEn: new Date() },
      });
      const despues = await parametros();
      await auditar(actor, contexto, {
        accion: 'cumplimiento.parametros',
        entidad: 'cumplimiento',
        entidadId: 'parametros',
        antes,
        despues,
      });
      return despues;
    },

    listarEntradas: () =>
      prisma.entradaListaRestrictiva.findMany({
        orderBy: [{ activa: 'desc' }, { nombre: 'asc' }],
        select: SELECCION_ENTRADA,
      }),

    async crearEntrada(
      datos: {
        fuente: 'onu' | 'ofac' | 'propia';
        nombre: string;
        numeroDocumento?: string | null | undefined;
        nota?: string | null | undefined;
      },
      actor: Actor,
      contexto: ContextoPeticion,
    ) {
      const entrada = await prisma.entradaListaRestrictiva.create({
        data: {
          fuente: datos.fuente,
          nombre: datos.nombre,
          numeroDocumento: datos.numeroDocumento ?? null,
          nota: datos.nota ?? null,
          creadoPorId: actor.id,
        },
        select: SELECCION_ENTRADA,
      });
      await auditar(actor, contexto, {
        accion: 'cumplimiento.lista_agregar',
        entidad: 'cumplimiento',
        entidadId: entrada.id,
        despues: { fuente: entrada.fuente, nombre: entrada.nombre },
      });
      return entrada;
    },

    async editarEntrada(id: string, activa: boolean, actor: Actor, contexto: ContextoPeticion) {
      const existe = await prisma.entradaListaRestrictiva.findUnique({ where: { id } });
      if (!existe) throw errores.noEncontrado('La entrada no existe.');
      const entrada = await prisma.entradaListaRestrictiva.update({
        where: { id },
        data: { activa },
        select: SELECCION_ENTRADA,
      });
      await auditar(actor, contexto, {
        accion: activa ? 'cumplimiento.lista_reactivar' : 'cumplimiento.lista_desactivar',
        entidad: 'cumplimiento',
        entidadId: id,
        despues: { nombre: entrada.nombre, activa },
      });
      return entrada;
    },

    async listarAlertas(filtro: { estado?: 'abierta' | 'descartada' | 'escalada' | undefined }) {
      const filas = await prisma.alertaCumplimiento.findMany({
        where: filtro.estado ? { estado: filtro.estado } : {},
        orderBy: { creadoEn: 'desc' },
        take: 200,
        select: SELECCION_ALERTA,
      });
      return filas.map(aAlerta);
    },

    /**
     * Revisar una alerta (§5.13): descartarla con justificación o escalarla. Una alerta escalada se
     * puede descartar después (con su justificación); una descartada ya no cambia.
     */
    async resolverAlerta(
      id: string,
      estado: 'descartada' | 'escalada',
      justificacion: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ) {
      const cambio = await prisma.alertaCumplimiento.updateMany({
        where: {
          id,
          estado: { in: estado === 'escalada' ? ['abierta'] : ['abierta', 'escalada'] },
        },
        data: { estado, justificacion, resueltaPorId: actor.id, resueltaEn: new Date() },
      });
      if (cambio.count === 0) {
        await cargarAlerta(id);
        throw errores.estadoInvalido(
          estado === 'escalada'
            ? 'Solo se escala una alerta abierta.'
            : 'Esa alerta ya fue descartada.',
        );
      }
      await auditar(actor, contexto, {
        accion:
          estado === 'escalada' ? 'cumplimiento.alerta_escalar' : 'cumplimiento.alerta_descartar',
        entidad: 'cumplimiento',
        entidadId: id,
        despues: { estado, justificacion },
      });
      return cargarAlerta(id);
    },

    async cliente(id: string, verAlertas: boolean) {
      const cliente = await prisma.cliente.findUnique({
        where: { id },
        select: {
          id: true,
          nombre: true,
          tipoDocumento: true,
          numeroDocumento: true,
          perfilRiesgo: {
            select: {
              actividadEconomica: true,
              origenFondos: true,
              direccion: true,
              pep: true,
              nivel: true,
              motivoNivel: true,
              actualizadoEn: true,
            },
          },
        },
      });
      if (!cliente) throw errores.noEncontrado('El cliente no existe.');
      const alertas = verAlertas
        ? await prisma.alertaCumplimiento.findMany({
            where: { clienteId: id },
            orderBy: { creadoEn: 'desc' },
            take: 50,
            select: SELECCION_ALERTA,
          })
        : [];
      const { perfilRiesgo, ...datos } = cliente;
      return {
        cliente: datos,
        perfil: perfilRiesgo,
        acumulados: await acumuladosDe(prisma, id),
        alertas: alertas.map(aAlerta),
      };
    },

    async guardarFicha(
      id: string,
      datos: {
        actividadEconomica?: string | null | undefined;
        origenFondos?: string | null | undefined;
        direccion?: string | null | undefined;
        pep?: boolean | undefined;
      },
      actor: Actor,
      contexto: ContextoPeticion,
    ) {
      const cliente = await prisma.cliente.findUnique({ where: { id } });
      if (!cliente) throw errores.noEncontrado('El cliente no existe.');
      const limpio = {
        ...(datos.actividadEconomica === undefined
          ? {}
          : { actividadEconomica: datos.actividadEconomica }),
        ...(datos.origenFondos === undefined ? {} : { origenFondos: datos.origenFondos }),
        ...(datos.direccion === undefined ? {} : { direccion: datos.direccion }),
        ...(datos.pep === undefined ? {} : { pep: datos.pep }),
      };
      await prisma.perfilRiesgo.upsert({
        where: { clienteId: id },
        update: { ...limpio, actualizadoPorId: actor.id, actualizadoEn: new Date() },
        create: { ...limpio, clienteId: id, actualizadoPorId: actor.id },
      });
      await auditar(actor, contexto, {
        accion: 'cumplimiento.ficha',
        entidad: 'cliente',
        entidadId: id,
        despues: limpio,
      });
    },

    async guardarNivel(
      id: string,
      datos: { nivel: 'bajo' | 'medio' | 'alto'; motivo: string },
      actor: Actor,
      contexto: ContextoPeticion,
    ) {
      const cliente = await prisma.cliente.findUnique({
        where: { id },
        include: { perfilRiesgo: true },
      });
      if (!cliente) throw errores.noEncontrado('El cliente no existe.');
      await prisma.perfilRiesgo.upsert({
        where: { clienteId: id },
        update: {
          nivel: datos.nivel,
          motivoNivel: datos.motivo,
          actualizadoPorId: actor.id,
          actualizadoEn: new Date(),
        },
        create: {
          clienteId: id,
          nivel: datos.nivel,
          motivoNivel: datos.motivo,
          actualizadoPorId: actor.id,
        },
      });
      await auditar(actor, contexto, {
        accion: 'cumplimiento.nivel',
        entidad: 'cliente',
        entidadId: id,
        antes: { nivel: cliente.perfilRiesgo?.nivel ?? 'bajo' },
        despues: { nivel: datos.nivel, motivo: datos.motivo },
      });
    },

    /**
     * Exporte de operaciones del periodo en CSV (§5.13, D153). El formato oficial de la UIAF está por
     * definir con el contador: este archivo trae los campos que ese reporte necesita y se ajusta luego.
     */
    async exportarOperaciones(filtro: { desde: string; hasta: string }) {
      const empresa = await prisma.empresa.findUnique({ where: { unica: true } });
      const zona = empresa?.zonaHoraria ?? 'America/Bogota';
      const rango = { gte: inicioDelDia(filtro.desde, zona), lte: finDelDia(filtro.hasta, zona) };
      const [remesas, divisas] = await Promise.all([
        prisma.operacion.findMany({
          where: { creadoEn: rango, estado: { notIn: ['anulada'] } },
          orderBy: { creadoEn: 'asc' },
          select: {
            numeroComprobante: true,
            creadoEn: true,
            estado: true,
            montoPesos: true,
            montoBolivares: true,
            tasaUsada: true,
            remitente: { select: { tipoDocumento: true, numeroDocumento: true, nombre: true } },
            transferencia: {
              select: {
                medioPago: {
                  select: {
                    cliente: {
                      select: { tipoDocumento: true, numeroDocumento: true, nombre: true },
                    },
                  },
                },
              },
            },
          },
        }),
        prisma.operacionDivisa.findMany({
          where: { creadoEn: rango, anuladoEn: null },
          orderBy: { creadoEn: 'asc' },
          select: {
            numeroComprobante: true,
            creadoEn: true,
            tipo: true,
            moneda: true,
            montoDivisa: true,
            montoPesos: true,
            tasaUsada: true,
            clienteNombre: true,
            clienteDocumento: true,
          },
        }),
      ]);
      const encabezado = [
        'comprobante',
        'fecha_utc',
        'tipo',
        'estado',
        'documento_cliente',
        'nombre_cliente',
        'documento_beneficiario',
        'nombre_beneficiario',
        'moneda_local',
        'monto_local',
        'moneda_extranjera',
        'monto_extranjero',
        'tasa',
      ];
      const filas = [
        ...remesas.map((r) => {
          const b = r.transferencia?.medioPago.cliente;
          return [
            r.numeroComprobante,
            r.creadoEn.toISOString(),
            'remesa',
            r.estado,
            `${r.remitente.tipoDocumento} ${r.remitente.numeroDocumento}`,
            r.remitente.nombre,
            b ? `${b.tipoDocumento} ${b.numeroDocumento}` : '',
            b?.nombre ?? '',
            'COP',
            r.montoPesos.toFixed(2),
            'VES',
            r.montoBolivares.toFixed(3),
            r.tasaUsada.toFixed(6),
          ];
        }),
        ...divisas.map((d) => [
          d.numeroComprobante,
          d.creadoEn.toISOString(),
          d.tipo === 'compra' ? 'compra_divisa' : 'venta_divisa',
          'vigente',
          d.clienteDocumento ?? '',
          d.clienteNombre ?? '',
          '',
          '',
          'COP',
          d.montoPesos.toFixed(2),
          d.moneda,
          d.montoDivisa.toFixed(2),
          d.tasaUsada.toFixed(6),
        ]),
      ];
      return [encabezado, ...filas].map((fila) => fila.map(celda).join(',')).join('\r\n') + '\r\n';
    },
  };
}
