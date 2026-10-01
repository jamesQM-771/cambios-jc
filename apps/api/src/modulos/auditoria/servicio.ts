import { finDelDia, inicioDelDia } from '@cambios-jc/shared';

import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../lib/prisma.js';

import type { ConsultaAuditoria } from './esquemas.js';

// Si la empresa aún no existe (instalación sin datos iniciales) se usa la zona de Cambios JC.
const ZONA_POR_DEFECTO = 'America/Bogota';

export type ServicioAuditoria = ReturnType<typeof crearServicioAuditoria>;

export function crearServicioAuditoria({ prisma }: { prisma: PrismaClient }) {
  return {
    /** Registros de la bitácora, del más reciente al más antiguo. Los días se miden en la zona de la empresa. */
    async consultar(consulta: ConsultaAuditoria) {
      const empresa = await prisma.empresa.findUnique({
        where: { unica: true },
        select: { zonaHoraria: true },
      });
      const zona = empresa?.zonaHoraria ?? ZONA_POR_DEFECTO;

      const donde: Prisma.AuditoriaWhereInput = {
        ...(consulta.usuarioId ? { usuarioId: consulta.usuarioId } : {}),
        ...(consulta.accion ? { accion: consulta.accion } : {}),
        ...(consulta.entidad ? { entidad: consulta.entidad } : {}),
        ...(consulta.entidadId ? { entidadId: consulta.entidadId } : {}),
        ...(consulta.desde || consulta.hasta
          ? {
              fecha: {
                ...(consulta.desde ? { gte: inicioDelDia(consulta.desde, zona) } : {}),
                ...(consulta.hasta ? { lte: finDelDia(consulta.hasta, zona) } : {}),
              },
            }
          : {}),
      };

      const [filas, total] = await Promise.all([
        prisma.auditoria.findMany({
          where: donde,
          include: { usuario: { select: { id: true, login: true, nombre: true } } },
          orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
          skip: (consulta.pagina - 1) * consulta.porPagina,
          take: consulta.porPagina,
        }),
        prisma.auditoria.count({ where: donde }),
      ]);

      return {
        registros: filas.map(({ id, usuario, ...fila }) => ({
          ...fila,
          id: id.toString(),
          usuario,
        })),
        total,
        pagina: consulta.pagina,
        porPagina: consulta.porPagina,
      };
    },
  };
}
