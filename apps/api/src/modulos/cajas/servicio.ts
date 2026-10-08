import { Prisma } from '../../generated/prisma/client.js';
import { ErrorApp, errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria, type DatosAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type { CajaPublica } from './esquemas.js';

const SELECCION_PUBLICA = {
  id: true,
  nombre: true,
  sucursalId: true,
  activa: true,
  sucursal: { select: { nombre: true } },
} satisfies Prisma.CajaSelect;

type FilaPublica = Prisma.CajaGetPayload<{ select: typeof SELECCION_PUBLICA }>;

function aPublica({ sucursal, ...caja }: FilaPublica): CajaPublica {
  return { ...caja, sucursalNombre: sucursal.nombre };
}

export interface FiltroCajas {
  sucursalId?: string | undefined;
  activa?: boolean | undefined;
}

export interface DatosNuevaCaja {
  nombre: string;
  sucursalId: string;
}

export interface CambiosCaja {
  nombre?: string | undefined;
}

export interface Actor {
  id: string;
}

export type ServicioCajas = ReturnType<typeof crearServicioCajas>;

export function crearServicioCajas({ prisma }: { prisma: PrismaClient }) {
  const auditar = (
    actor: Actor,
    contexto: ContextoPeticion,
    datos: Omit<DatosAuditoria, 'usuarioId' | 'ip' | 'agenteUsuario' | 'entidad'>,
  ) =>
    registrarAuditoria(prisma, {
      ...datos,
      usuarioId: actor.id,
      entidad: 'caja',
      ip: contexto.ip,
      agenteUsuario: contexto.agenteUsuario,
    });

  async function exigirSucursalActiva(sucursalId: string): Promise<void> {
    const sucursal = await prisma.sucursal.findFirst({ where: { id: sucursalId, activa: true } });
    if (!sucursal) {
      throw new ErrorApp(400, 'VALIDACION_FALLIDA', 'Los datos enviados no son válidos.', [
        { campo: 'sucursalId', mensaje: 'La sucursal no existe o está inactiva.' },
      ]);
    }
  }

  async function cargar(id: string): Promise<FilaPublica> {
    const caja = await prisma.caja.findUnique({ where: { id }, select: SELECCION_PUBLICA });
    if (!caja) throw errores.noEncontrado('La caja no existe.');
    return caja;
  }

  return {
    async listar(filtro: FiltroCajas): Promise<CajaPublica[]> {
      const cajas = await prisma.caja.findMany({
        where: {
          ...(filtro.sucursalId === undefined ? {} : { sucursalId: filtro.sucursalId }),
          ...(filtro.activa === undefined ? {} : { activa: filtro.activa }),
        },
        orderBy: [{ sucursal: { nombre: 'asc' } }, { nombre: 'asc' }],
        select: SELECCION_PUBLICA,
      });
      return cajas.map(aPublica);
    },

    async crear(
      datos: DatosNuevaCaja,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<CajaPublica> {
      await exigirSucursalActiva(datos.sucursalId);
      try {
        const creada = await prisma.caja.create({ data: datos, select: SELECCION_PUBLICA });
        const publica = aPublica(creada);
        await auditar(actor, contexto, {
          accion: 'caja.crear',
          entidadId: publica.id,
          despues: publica,
        });
        return publica;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw errores.valorEnUso('nombre', 'Ya existe una caja con ese nombre en esa sucursal.');
        }
        throw error;
      }
    },

    async editar(
      id: string,
      cambios: CambiosCaja,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<CajaPublica> {
      const antes = aPublica(await cargar(id));
      try {
        const editada = await prisma.caja.update({
          where: { id },
          data: cambios,
          select: SELECCION_PUBLICA,
        });
        const publica = aPublica(editada);
        await auditar(actor, contexto, {
          accion: 'caja.editar',
          entidadId: id,
          antes,
          despues: publica,
        });
        return publica;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw errores.valorEnUso('nombre', 'Ya existe una caja con ese nombre en esa sucursal.');
        }
        throw error;
      }
    },

    async desactivar(id: string, actor: Actor, contexto: ContextoPeticion): Promise<CajaPublica> {
      const antes = aPublica(await cargar(id));
      if (!antes.activa) return antes;
      const editada = await prisma.caja.update({
        where: { id },
        data: { activa: false },
        select: SELECCION_PUBLICA,
      });
      await auditar(actor, contexto, { accion: 'caja.desactivar', entidadId: id });
      return aPublica(editada);
    },

    async reactivar(id: string, actor: Actor, contexto: ContextoPeticion): Promise<CajaPublica> {
      const antes = aPublica(await cargar(id));
      if (antes.activa) return antes;
      const editada = await prisma.caja.update({
        where: { id },
        data: { activa: true },
        select: SELECCION_PUBLICA,
      });
      await auditar(actor, contexto, { accion: 'caja.reactivar', entidadId: id });
      return aPublica(editada);
    },
  };
}
