import { Prisma } from '../../generated/prisma/client.js';
import { errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria, type DatosAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import type { BancoPublico } from './esquemas.js';

const SELECCION_PUBLICA = {
  id: true,
  codigo: true,
  nombre: true,
  pais: true,
  activo: true,
  creadoEn: true,
} satisfies Prisma.BancoSelect;

export interface FiltroBancos {
  activo?: boolean | undefined;
  busqueda?: string | undefined;
}

export interface DatosNuevoBanco {
  codigo: string;
  nombre: string;
  pais: string;
}

export interface CambiosBanco {
  codigo?: string | undefined;
  nombre?: string | undefined;
  pais?: string | undefined;
}

export interface Actor {
  id: string;
}

export type ServicioBancos = ReturnType<typeof crearServicioBancos>;

export function crearServicioBancos({ prisma }: { prisma: PrismaClient }) {
  const auditar = (
    actor: Actor,
    contexto: ContextoPeticion,
    datos: Omit<DatosAuditoria, 'usuarioId' | 'ip' | 'agenteUsuario' | 'entidad'>,
  ) =>
    registrarAuditoria(prisma, {
      ...datos,
      usuarioId: actor.id,
      entidad: 'banco',
      ip: contexto.ip,
      agenteUsuario: contexto.agenteUsuario,
    });

  // "codigo" está en la lista de campos que la bitácora oculta siempre (pensada para el código del
  // 2FA, CLAUDE.md §7): el campo del banco necesita su propia clave para no perderse como "[OCULTO]".
  const paraAuditoria = (banco: BancoPublico) => ({
    codigoBanco: banco.codigo,
    nombre: banco.nombre,
    pais: banco.pais,
    activo: banco.activo,
  });

  async function cargar(id: string): Promise<BancoPublico> {
    const banco = await prisma.banco.findUnique({ where: { id }, select: SELECCION_PUBLICA });
    if (!banco) throw errores.noEncontrado('El banco no existe.');
    return banco;
  }

  return {
    async listar(filtro: FiltroBancos): Promise<BancoPublico[]> {
      return prisma.banco.findMany({
        where: {
          ...(filtro.activo === undefined ? {} : { activo: filtro.activo }),
          ...(filtro.busqueda
            ? {
                OR: [
                  { nombre: { contains: filtro.busqueda, mode: 'insensitive' } },
                  { codigo: { contains: filtro.busqueda } },
                ],
              }
            : {}),
        },
        orderBy: { codigo: 'asc' },
        select: SELECCION_PUBLICA,
      });
    },

    async crear(
      datos: DatosNuevoBanco,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<BancoPublico> {
      try {
        const creado = await prisma.banco.create({ data: datos, select: SELECCION_PUBLICA });
        await auditar(actor, contexto, {
          accion: 'banco.crear',
          entidadId: creado.id,
          despues: paraAuditoria(creado),
        });
        return creado;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw errores.codigoEnUso('Ya existe un banco con ese código.');
        }
        throw error;
      }
    },

    async editar(
      id: string,
      cambios: CambiosBanco,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<BancoPublico> {
      const antes = await cargar(id);
      try {
        const editado = await prisma.banco.update({
          where: { id },
          data: cambios,
          select: SELECCION_PUBLICA,
        });
        await auditar(actor, contexto, {
          accion: 'banco.editar',
          entidadId: id,
          antes: paraAuditoria(antes),
          despues: paraAuditoria(editado),
        });
        return editado;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw errores.codigoEnUso('Ya existe un banco con ese código.');
        }
        throw error;
      }
    },

    async desactivar(id: string, actor: Actor, contexto: ContextoPeticion): Promise<BancoPublico> {
      const antes = await cargar(id);
      if (!antes.activo) return antes;
      const editado = await prisma.banco.update({
        where: { id },
        data: { activo: false },
        select: SELECCION_PUBLICA,
      });
      await auditar(actor, contexto, { accion: 'banco.desactivar', entidadId: id });
      return editado;
    },

    async reactivar(id: string, actor: Actor, contexto: ContextoPeticion): Promise<BancoPublico> {
      const antes = await cargar(id);
      if (antes.activo) return antes;
      const editado = await prisma.banco.update({
        where: { id },
        data: { activo: true },
        select: SELECCION_PUBLICA,
      });
      await auditar(actor, contexto, { accion: 'banco.reactivar', entidadId: id });
      return editado;
    },
  };
}
