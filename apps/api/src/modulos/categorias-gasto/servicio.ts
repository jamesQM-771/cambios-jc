import { Prisma } from '../../generated/prisma/client.js';
import { errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria, type DatosAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type { CategoriaGastoPublica } from './esquemas.js';

const SELECCION_PUBLICA = {
  id: true,
  nombre: true,
  activa: true,
  creadoEn: true,
} satisfies Prisma.CategoriaGastoSelect;

interface Actor {
  id: string;
}

export type ServicioCategoriasGasto = ReturnType<typeof crearServicioCategoriasGasto>;

export function crearServicioCategoriasGasto({ prisma }: { prisma: PrismaClient }) {
  const auditar = (
    actor: Actor,
    contexto: ContextoPeticion,
    datos: Omit<DatosAuditoria, 'usuarioId' | 'ip' | 'agenteUsuario' | 'entidad'>,
  ) =>
    registrarAuditoria(prisma, {
      ...datos,
      usuarioId: actor.id,
      entidad: 'categoria_gasto',
      ip: contexto.ip,
      agenteUsuario: contexto.agenteUsuario,
    });

  const nombreEnUso = () =>
    errores.valorEnUso('nombre', 'Ya existe una categoría de gasto con ese nombre.');

  async function cargar(id: string): Promise<CategoriaGastoPublica> {
    const categoria = await prisma.categoriaGasto.findUnique({
      where: { id },
      select: SELECCION_PUBLICA,
    });
    if (!categoria) throw errores.noEncontrado('La categoría no existe.');
    return categoria;
  }

  return {
    async listar(filtro: { activa?: boolean | undefined }): Promise<CategoriaGastoPublica[]> {
      return prisma.categoriaGasto.findMany({
        where: filtro.activa === undefined ? {} : { activa: filtro.activa },
        orderBy: { nombre: 'asc' },
        select: SELECCION_PUBLICA,
      });
    },

    async crear(
      datos: { nombre: string },
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<CategoriaGastoPublica> {
      try {
        const creada = await prisma.categoriaGasto.create({
          data: datos,
          select: SELECCION_PUBLICA,
        });
        await auditar(actor, contexto, {
          accion: 'categoria_gasto.crear',
          entidadId: creada.id,
          despues: { nombre: creada.nombre },
        });
        return creada;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw nombreEnUso();
        }
        throw error;
      }
    },

    async editar(
      id: string,
      datos: { nombre: string },
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<CategoriaGastoPublica> {
      const antes = await cargar(id);
      try {
        const editada = await prisma.categoriaGasto.update({
          where: { id },
          data: datos,
          select: SELECCION_PUBLICA,
        });
        await auditar(actor, contexto, {
          accion: 'categoria_gasto.editar',
          entidadId: id,
          antes: { nombre: antes.nombre },
          despues: { nombre: editada.nombre },
        });
        return editada;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw nombreEnUso();
        }
        throw error;
      }
    },

    async desactivar(
      id: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<CategoriaGastoPublica> {
      const antes = await cargar(id);
      if (!antes.activa) return antes;
      const editada = await prisma.categoriaGasto.update({
        where: { id },
        data: { activa: false },
        select: SELECCION_PUBLICA,
      });
      await auditar(actor, contexto, { accion: 'categoria_gasto.desactivar', entidadId: id });
      return editada;
    },

    async reactivar(
      id: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<CategoriaGastoPublica> {
      const antes = await cargar(id);
      if (antes.activa) return antes;
      const editada = await prisma.categoriaGasto.update({
        where: { id },
        data: { activa: true },
        select: SELECCION_PUBLICA,
      });
      await auditar(actor, contexto, { accion: 'categoria_gasto.reactivar', entidadId: id });
      return editada;
    },
  };
}
