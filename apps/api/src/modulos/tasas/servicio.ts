import {
  Decimal,
  DECIMALES_TASA,
  finDelDia,
  inicioDelDia,
  tasaDesdeMargenPorcentaje,
} from '@cambios-jc/shared';

import type { Prisma } from '../../generated/prisma/client.js';
import { errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria, type DatosAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type { TasaPublica } from './esquemas.js';

// Si la empresa aún no existe (instalación sin datos iniciales) se usa la zona de Cambios JC.
const ZONA_POR_DEFECTO = 'America/Bogota';

const SELECCION_PUBLICA = {
  id: true,
  lineaNegocioId: true,
  lineaNegocio: { select: { nombre: true } },
  tasaReferencia: true,
  margenUsado: true,
  tasaCompra: true,
  tasaVenta: true,
  publicadaPorId: true,
  publicadaPor: { select: { nombre: true } },
  motivo: true,
  vigenteDesde: true,
  vigenteHasta: true,
} satisfies Prisma.TasaSelect;

type FilaTasa = Prisma.TasaGetPayload<{ select: typeof SELECCION_PUBLICA }>;

function aPublica(fila: FilaTasa): TasaPublica {
  const { lineaNegocio, publicadaPor, ...resto } = fila;
  return {
    ...resto,
    lineaNegocioNombre: lineaNegocio.nombre,
    tasaReferencia: fila.tasaReferencia?.toFixed(DECIMALES_TASA) ?? null,
    margenUsado: fila.margenUsado?.toFixed(DECIMALES_TASA) ?? null,
    tasaCompra: fila.tasaCompra?.toFixed(DECIMALES_TASA) ?? null,
    tasaVenta: fila.tasaVenta.toFixed(DECIMALES_TASA),
    publicadaPorNombre: publicadaPor.nombre,
  };
}

export interface FiltroTasas {
  lineaNegocioId?: string | undefined;
  vigente?: boolean | undefined;
  desde?: string | undefined;
  hasta?: string | undefined;
}

export type DatosPublicarTasa =
  | { modoTasa: 'porcentaje'; lineaNegocioId: string; tasaReferencia: string; motivo?: string }
  | {
      modoTasa: 'directo';
      lineaNegocioId: string;
      tasaVenta: string;
      tasaCompra?: string;
      motivo?: string;
    };

export interface Actor {
  id: string;
}

export type ServicioTasas = ReturnType<typeof crearServicioTasas>;

export function crearServicioTasas({ prisma }: { prisma: PrismaClient }) {
  const auditar = (
    actor: Actor,
    contexto: ContextoPeticion,
    datos: Omit<DatosAuditoria, 'usuarioId' | 'ip' | 'agenteUsuario' | 'entidad'>,
  ) =>
    registrarAuditoria(prisma, {
      ...datos,
      usuarioId: actor.id,
      entidad: 'tasa',
      ip: contexto.ip,
      agenteUsuario: contexto.agenteUsuario,
    });

  return {
    async listar(filtro: FiltroTasas): Promise<TasaPublica[]> {
      const empresa = await prisma.empresa.findUnique({
        where: { unica: true },
        select: { zonaHoraria: true },
      });
      const zona = empresa?.zonaHoraria ?? ZONA_POR_DEFECTO;

      const filas = await prisma.tasa.findMany({
        where: {
          ...(filtro.lineaNegocioId ? { lineaNegocioId: filtro.lineaNegocioId } : {}),
          ...(filtro.vigente === undefined
            ? {}
            : { vigenteHasta: filtro.vigente ? null : { not: null } }),
          ...(filtro.desde || filtro.hasta
            ? {
                vigenteDesde: {
                  ...(filtro.desde ? { gte: inicioDelDia(filtro.desde, zona) } : {}),
                  ...(filtro.hasta ? { lte: finDelDia(filtro.hasta, zona) } : {}),
                },
              }
            : {}),
        },
        orderBy: { vigenteDesde: 'desc' },
        select: SELECCION_PUBLICA,
      });
      return filas.map(aPublica);
    },

    async publicar(
      datos: DatosPublicarTasa,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<TasaPublica> {
      return prisma.$transaction(async (tx) => {
        const linea = await tx.lineaNegocio.findUnique({ where: { id: datos.lineaNegocioId } });
        if (!linea) throw errores.noEncontrado('La línea de negocio no existe.');
        if (!linea.activa) {
          throw errores.estadoInvalido('No se puede publicar una tasa para una línea inactiva.');
        }
        if (linea.modoTasa !== datos.modoTasa) {
          throw errores.estadoInvalido(
            `Esta línea usa el modo de tasa "${linea.modoTasa}", no "${datos.modoTasa}".`,
          );
        }

        let data: Prisma.TasaUncheckedCreateInput;
        if (datos.modoTasa === 'porcentaje') {
          if (linea.margenVenta === null) {
            throw errores.estadoInvalido(
              'Configura el margen de venta de la línea antes de publicar una tasa.',
            );
          }
          const tasaVenta = tasaDesdeMargenPorcentaje(
            datos.tasaReferencia,
            linea.margenVenta.toString(),
          );
          data = {
            lineaNegocioId: linea.id,
            tasaReferencia: datos.tasaReferencia,
            margenUsado: linea.margenVenta,
            tasaVenta: tasaVenta.toString(),
            publicadaPorId: actor.id,
            motivo: datos.motivo ?? null,
          };
        } else {
          data = {
            lineaNegocioId: linea.id,
            tasaVenta: fijarTasa(datos.tasaVenta),
            tasaCompra: datos.tasaCompra === undefined ? null : fijarTasa(datos.tasaCompra),
            publicadaPorId: actor.id,
            motivo: datos.motivo ?? null,
          };
        }

        const ahora = new Date();
        // La tasa anterior (si existe) deja de estar vigente justo cuando empieza la nueva.
        await tx.tasa.updateMany({
          where: { lineaNegocioId: linea.id, vigenteHasta: null },
          data: { vigenteHasta: ahora },
        });
        const creada = aPublica(
          await tx.tasa.create({
            data: { ...data, vigenteDesde: ahora },
            select: SELECCION_PUBLICA,
          }),
        );
        await auditar(actor, contexto, {
          accion: 'tasa.publicar',
          entidadId: creada.id,
          despues: {
            lineaNegocioId: linea.id,
            lineaNegocioNombre: linea.nombre,
            tasaReferencia: creada.tasaReferencia,
            margenUsado: creada.margenUsado,
            tasaCompra: creada.tasaCompra,
            tasaVenta: creada.tasaVenta,
            motivo: creada.motivo,
          },
        });
        return creada;
      });
    },
  };
}

/** Fija un valor de tasa (no un monto de dinero) a los decimales con que se guardan tasas y márgenes. */
function fijarTasa(valor: string): string {
  return new Decimal(valor).toFixed(DECIMALES_TASA);
}
