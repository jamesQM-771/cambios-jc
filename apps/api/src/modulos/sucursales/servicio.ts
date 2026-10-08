import { Prisma } from '../../generated/prisma/client.js';
import { errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria, type DatosAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type { SucursalPublica } from './esquemas.js';

const SELECCION_PUBLICA = {
  id: true,
  nombre: true,
  ciudad: true,
  activa: true,
} satisfies Prisma.SucursalSelect;

export interface FiltroSucursales {
  activa?: boolean | undefined;
}

export interface DatosNuevaSucursal {
  nombre: string;
  ciudad: string;
}

export interface CambiosSucursal {
  nombre?: string | undefined;
  ciudad?: string | undefined;
}

export interface Actor {
  id: string;
}

export type ServicioSucursales = ReturnType<typeof crearServicioSucursales>;

export function crearServicioSucursales({ prisma }: { prisma: PrismaClient }) {
  const auditar = (
    actor: Actor,
    contexto: ContextoPeticion,
    datos: Omit<DatosAuditoria, 'usuarioId' | 'ip' | 'agenteUsuario' | 'entidad'>,
  ) =>
    registrarAuditoria(prisma, {
      ...datos,
      usuarioId: actor.id,
      entidad: 'sucursal',
      ip: contexto.ip,
      agenteUsuario: contexto.agenteUsuario,
    });

  async function cargar(id: string): Promise<SucursalPublica> {
    const sucursal = await prisma.sucursal.findUnique({
      where: { id },
      select: SELECCION_PUBLICA,
    });
    if (!sucursal) throw errores.noEncontrado('La sucursal no existe.');
    return sucursal;
  }

  return {
    async listar(filtro: FiltroSucursales): Promise<SucursalPublica[]> {
      return prisma.sucursal.findMany({
        where: filtro.activa === undefined ? {} : { activa: filtro.activa },
        orderBy: { nombre: 'asc' },
        select: SELECCION_PUBLICA,
      });
    },

    async crear(
      datos: DatosNuevaSucursal,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<SucursalPublica> {
      try {
        const creada = await prisma.sucursal.create({ data: datos, select: SELECCION_PUBLICA });
        await auditar(actor, contexto, {
          accion: 'sucursal.crear',
          entidadId: creada.id,
          despues: creada,
        });
        return creada;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw errores.valorEnUso('nombre', 'Ya existe una sucursal con ese nombre.');
        }
        throw error;
      }
    },

    async editar(
      id: string,
      cambios: CambiosSucursal,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<SucursalPublica> {
      const antes = await cargar(id);
      try {
        const editada = await prisma.sucursal.update({
          where: { id },
          data: cambios,
          select: SELECCION_PUBLICA,
        });
        await auditar(actor, contexto, {
          accion: 'sucursal.editar',
          entidadId: id,
          antes,
          despues: editada,
        });
        return editada;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw errores.valorEnUso('nombre', 'Ya existe una sucursal con ese nombre.');
        }
        throw error;
      }
    },

    async desactivar(
      id: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<SucursalPublica> {
      const antes = await cargar(id);
      if (!antes.activa) return antes;

      // No se puede dejar sin sucursal asignada a un usuario activo ni a una caja activa.
      const [usuariosActivos, cajasActivas] = await Promise.all([
        prisma.usuario.count({ where: { sucursalId: id, activo: true } }),
        prisma.caja.count({ where: { sucursalId: id, activa: true } }),
      ]);
      if (usuariosActivos > 0) {
        throw errores.estadoInvalido(
          `No se puede desactivar: tiene ${String(usuariosActivos)} usuario(s) activo(s) asignado(s). Reasígnalos o desactívalos primero.`,
        );
      }
      if (cajasActivas > 0) {
        throw errores.estadoInvalido(
          `No se puede desactivar: tiene ${String(cajasActivas)} caja(s) activa(s). Desactívalas primero.`,
        );
      }

      const editada = await prisma.sucursal.update({
        where: { id },
        data: { activa: false },
        select: SELECCION_PUBLICA,
      });
      await auditar(actor, contexto, { accion: 'sucursal.desactivar', entidadId: id });
      return editada;
    },

    async reactivar(
      id: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<SucursalPublica> {
      const antes = await cargar(id);
      if (antes.activa) return antes;
      const editada = await prisma.sucursal.update({
        where: { id },
        data: { activa: true },
        select: SELECCION_PUBLICA,
      });
      await auditar(actor, contexto, { accion: 'sucursal.reactivar', entidadId: id });
      return editada;
    },
  };
}
