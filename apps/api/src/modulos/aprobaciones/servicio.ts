import { comprobarAprobacion, tienePermiso, type Rol } from '@cambios-jc/shared';
import { z } from 'zod';

import { Prisma, type AccionAprobacion } from '../../generated/prisma/client.js';
import { errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { ContextoPeticion } from '../auth/servicio.js';

export const ACCIONES = [
  'reabrir_jornada',
  'devolver_remesa',
  'anular_remesa',
  'anular_divisa',
  'anular_compra',
  'anular_gasto',
  'anular_traslado',
  'ajuste_contraparte',
  'ajuste_inventario',
] as const;

export const esquemaSolicitud = z.object({
  id: z.string(),
  accion: z.enum(ACCIONES),
  entidadId: z.string(),
  descripcion: z.string(),
  estado: z.enum(['pendiente', 'aprobada', 'rechazada']),
  solicitante: z.object({ id: z.string(), nombre: z.string() }),
  aprobador: z.object({ id: z.string(), nombre: z.string() }).nullable(),
  comentario: z.string().nullable(),
  resueltaEn: z.date().nullable(),
  creadoEn: z.date(),
});

export type SolicitudPublica = z.infer<typeof esquemaSolicitud>;

/** Respuesta de una acción que quedó esperando aprobación (HTTP 202). */
export const respuestaSolicitud = z.object({ solicitud: esquemaSolicitud });

export const esquemaParametrosDobleControl = z
  .object({
    reaperturaJornada: z.boolean(),
    devoluciones: z.boolean(),
    anulaciones: z.boolean(),
    ajustes: z.boolean(),
  })
  .strict();

export type ParametrosDobleControl = z.infer<typeof esquemaParametrosDobleControl>;

const SELECCION = {
  id: true,
  accion: true,
  entidadId: true,
  descripcion: true,
  estado: true,
  solicitante: { select: { id: true, nombre: true } },
  aprobador: { select: { id: true, nombre: true } },
  comentario: true,
  resueltaEn: true,
  creadoEn: true,
} satisfies Prisma.SolicitudAprobacionSelect;

interface Actor {
  id: string;
}

/** Ejecuta la acción guardada cuando otra persona la aprueba (con el aprobador como autor). */
export type Ejecutor = (
  entidadId: string,
  datos: Record<string, unknown>,
  actor: Actor,
  contexto: ContextoPeticion,
) => Promise<unknown>;

const BANDERA: Record<AccionAprobacion, keyof ParametrosDobleControl> = {
  reabrir_jornada: 'reaperturaJornada',
  devolver_remesa: 'devoluciones',
  anular_remesa: 'anulaciones',
  anular_divisa: 'anulaciones',
  anular_compra: 'anulaciones',
  anular_gasto: 'anulaciones',
  anular_traslado: 'anulaciones',
  ajuste_contraparte: 'ajustes',
  ajuste_inventario: 'ajustes',
};

export type ServicioAprobaciones = ReturnType<typeof crearServicioAprobaciones>;

export function crearServicioAprobaciones({ prisma }: { prisma: PrismaClient }) {
  const ejecutores = new Map<AccionAprobacion, Ejecutor>();

  async function parametros(): Promise<ParametrosDobleControl> {
    const fila = await prisma.parametrosDobleControl.upsert({
      where: { unica: true },
      update: {},
      create: {},
    });
    return {
      reaperturaJornada: fila.reaperturaJornada,
      devoluciones: fila.devoluciones,
      anulaciones: fila.anulaciones,
      ajustes: fila.ajustes,
    };
  }

  async function cargar(id: string): Promise<SolicitudPublica> {
    const fila = await prisma.solicitudAprobacion.findUnique({ where: { id }, select: SELECCION });
    if (!fila) throw errores.noEncontrado('La solicitud no existe.');
    return fila;
  }

  const auditar = (
    actor: Actor,
    contexto: ContextoPeticion,
    accion: string,
    id: string,
    despues: object,
  ) =>
    registrarAuditoria(prisma, {
      usuarioId: actor.id,
      accion,
      entidad: 'aprobacion',
      entidadId: id,
      ip: contexto.ip,
      agenteUsuario: contexto.agenteUsuario,
      despues,
    });

  return {
    parametros,

    registrarEjecutor(accion: AccionAprobacion, ejecutor: Ejecutor): void {
      ejecutores.set(accion, ejecutor);
    },

    async guardarParametros(
      datos: ParametrosDobleControl,
      actor: Actor,
      contexto: ContextoPeticion,
    ) {
      await prisma.parametrosDobleControl.update({
        where: { unica: true },
        data: { ...datos, actualizadoEn: new Date() },
      });
      await auditar(actor, contexto, 'aprobacion.parametros', 'parametros', datos);
      return parametros();
    },

    /**
     * Si la acción requiere doble control (D163), la guarda como solicitud pendiente y devuelve la
     * solicitud: quien llama responde 202 y no ejecuta nada. Si no lo requiere, devuelve `null`.
     */
    async interceptar(
      accion: AccionAprobacion,
      entidadId: string,
      datos: Record<string, unknown>,
      descripcion: string,
      actor: Actor,
      contexto: ContextoPeticion,
    ): Promise<SolicitudPublica | null> {
      const params = await parametros();
      if (!params[BANDERA[accion]]) return null;
      try {
        const creada = await prisma.solicitudAprobacion.create({
          data: {
            accion,
            entidadId,
            datos: datos as Prisma.InputJsonValue,
            descripcion,
            solicitanteId: actor.id,
          },
          select: { id: true },
        });
        await auditar(actor, contexto, 'aprobacion.solicitar', creada.id, {
          accion,
          entidadId,
          descripcion,
        });
        return await cargar(creada.id);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw errores.estadoInvalido(
            'Ya hay una solicitud pendiente para esto: espera su aprobación.',
          );
        }
        throw error;
      }
    },

    async listar(estado: 'pendiente' | 'aprobada' | 'rechazada' | undefined) {
      return prisma.solicitudAprobacion.findMany({
        where: estado ? { estado } : {},
        orderBy: { creadoEn: 'desc' },
        take: 200,
        select: SELECCION,
      });
    },

    /**
     * Aprueba y ejecuta (§5.12): nadie aprueba lo propio. La solicitud se marca primero (cambio
     * condicionado: dos aprobaciones a la vez no ejecutan dos veces) y si la ejecución falla vuelve a
     * quedar pendiente, con el error explicado.
     */
    async aprobar(id: string, aprobador: { id: string; rol: Rol }, contexto: ContextoPeticion) {
      const solicitud = await prisma.solicitudAprobacion.findUnique({ where: { id } });
      if (!solicitud) throw errores.noEncontrado('La solicitud no existe.');
      const regla = comprobarAprobacion(
        solicitud.solicitanteId,
        aprobador.id,
        tienePermiso(aprobador.rol, 'aprobacion.aprobar'),
      );
      if (!regla.permitido) {
        throw regla.motivo === 'APROBAR_LO_PROPIO'
          ? errores.estadoInvalido(
              'No puedes aprobar tu propia solicitud: tiene que hacerlo otra persona.',
            )
          : errores.sinPermiso();
      }
      const ejecutor = ejecutores.get(solicitud.accion);
      if (!ejecutor) throw new Error(`Sin ejecutor para ${solicitud.accion}.`);
      const cambio = await prisma.solicitudAprobacion.updateMany({
        where: { id, estado: 'pendiente' },
        data: { estado: 'aprobada', aprobadorId: aprobador.id, resueltaEn: new Date() },
      });
      if (cambio.count === 0) throw errores.estadoInvalido('Esa solicitud ya fue resuelta.');
      try {
        await ejecutor(
          solicitud.entidadId,
          solicitud.datos as Record<string, unknown>,
          { id: aprobador.id },
          contexto,
        );
      } catch (error) {
        await prisma.solicitudAprobacion.update({
          where: { id },
          data: { estado: 'pendiente', aprobadorId: null, resueltaEn: null },
        });
        throw error;
      }
      await auditar({ id: aprobador.id }, contexto, 'aprobacion.aprobar', id, {
        accion: solicitud.accion,
        entidadId: solicitud.entidadId,
      });
      return cargar(id);
    },

    async rechazar(
      id: string,
      comentario: string,
      aprobador: { id: string; rol: Rol },
      contexto: ContextoPeticion,
    ) {
      const solicitud = await prisma.solicitudAprobacion.findUnique({ where: { id } });
      if (!solicitud) throw errores.noEncontrado('La solicitud no existe.');
      if (solicitud.solicitanteId === aprobador.id) {
        throw errores.estadoInvalido(
          'No puedes resolver tu propia solicitud: tiene que hacerlo otra persona.',
        );
      }
      const cambio = await prisma.solicitudAprobacion.updateMany({
        where: { id, estado: 'pendiente' },
        data: {
          estado: 'rechazada',
          aprobadorId: aprobador.id,
          comentario,
          resueltaEn: new Date(),
        },
      });
      if (cambio.count === 0) throw errores.estadoInvalido('Esa solicitud ya fue resuelta.');
      await auditar({ id: aprobador.id }, contexto, 'aprobacion.rechazar', id, { comentario });
      return cargar(id);
    },
  };
}
