import { Prisma } from '../../generated/prisma/client.js';
import { errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria, type DatosAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type { LineaNegocioPublica } from './esquemas.js';

const SELECCION_PUBLICA = {
  id: true,
  nombre: true,
  clase: true,
  monedaOrigen: true,
  monedaDestino: true,
  activa: true,
  creadoEn: true,
} satisfies Prisma.LineaNegocioSelect;

export interface FiltroLineasNegocio {
  clase?: 'remesa' | 'divisa_caja' | undefined;
  activa?: boolean | undefined;
}

export interface DatosNuevaLineaNegocio {
  nombre: string;
  clase: 'remesa' | 'divisa_caja';
  monedaOrigen: string;
  monedaDestino: string;
}

export interface CambiosLineaNegocio {
  nombre: string;
}

export interface Actor {
  id: string;
}

export type ServicioLineasNegocio = ReturnType<typeof crearServicioLineasNegocio>;

export function crearServicioLineasNegocio({ prisma }: { prisma: PrismaClient }) {
  const auditar = (
    actor: Actor,
    contexto: ContextoPeticion,
    datos: Omit<DatosAuditoria, 'usuarioId' | 'ip' | 'agenteUsuario' | 'entidad'>,
  ) =>
    registrarAuditoria(prisma, {
      ...datos,
      usuarioId: actor.id,
      entidad: 'linea_negocio',
      ip: contexto.ip,
      agenteUsuario: contexto.agenteUsuario,
    });

  async function cargar(id: string): Promise<LineaNegocioPublica> {
    const linea = await prisma.lineaNegocio.findUnique({
      where: { id },
      select: SELECCION_PUBLICA,
    });
    if (!linea) throw errores.noEncontrado('La línea de negocio no existe.');
    return linea;
  }

  return {
    async listar(filtro: FiltroLineasNegocio): Promise<LineaNegocioPublica[]> {
      return prisma.lineaNegocio.findMany({
        where: {
          ...(filtro.clase === undefined ? {} : { clase: filtro.clase }),
          ...(filtro.activa === undefined ? {} : { activa: filtro.activa }),
        },
        orderBy: { nombre: 'asc' },
        select: SELECCION_PUBLICA,
      });
    },

    async crear(
      datos: DatosNuevaLineaNegocio,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<LineaNegocioPublica> {
      try {
        const creada = await prisma.lineaNegocio.create({
          data: datos,
          select: SELECCION_PUBLICA,
        });
        await auditar(actor, contexto, {
          accion: 'linea_negocio.crear',
          entidadId: creada.id,
          despues: creada,
        });
        return creada;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw errores.valorEnUso('nombre', 'Ya existe una línea de negocio con ese nombre.');
        }
        throw error;
      }
    },

    async editar(
      id: string,
      cambios: CambiosLineaNegocio,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<LineaNegocioPublica> {
      const antes = await cargar(id);
      try {
        const editada = await prisma.lineaNegocio.update({
          where: { id },
          data: cambios,
          select: SELECCION_PUBLICA,
        });
        await auditar(actor, contexto, {
          accion: 'linea_negocio.editar',
          entidadId: id,
          antes,
          despues: editada,
        });
        return editada;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw errores.valorEnUso('nombre', 'Ya existe una línea de negocio con ese nombre.');
        }
        throw error;
      }
    },

    async desactivar(
      id: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<LineaNegocioPublica> {
      const antes = await cargar(id);
      if (!antes.activa) return antes;
      const editada = await prisma.lineaNegocio.update({
        where: { id },
        data: { activa: false },
        select: SELECCION_PUBLICA,
      });
      await auditar(actor, contexto, { accion: 'linea_negocio.desactivar', entidadId: id });
      return editada;
    },

    async reactivar(
      id: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<LineaNegocioPublica> {
      const antes = await cargar(id);
      if (antes.activa) return antes;
      const editada = await prisma.lineaNegocio.update({
        where: { id },
        data: { activa: true },
        select: SELECCION_PUBLICA,
      });
      await auditar(actor, contexto, { accion: 'linea_negocio.reactivar', entidadId: id });
      return editada;
    },
  };
}
