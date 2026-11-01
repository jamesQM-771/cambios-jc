import {
  PERMISOS,
  PERMISOS_INCOMPATIBLES,
  PERMISOS_SOLO_ADMINISTRADOR,
  ROLES,
  permisosDeRol as permisosDeFabrica,
} from '@cambios-jc/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { errores } from '../../lib/errores.js';
import {
  cargarPermisos,
  esConfiguradoPorElDueno,
  permisosDeRol,
  problemasDePermisos,
} from '../../lib/permisos.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { registrarAuditoria } from '../../lib/registrar-auditoria.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';

const CONFIGURAR = { permiso: 'permiso.configurar' } as const;

const respuestaPermisos = z.object({
  catalogo: z.array(z.string()),
  roles: z.array(
    z.object({
      rol: z.enum(ROLES),
      permisos: z.array(z.string()),
      deFabrica: z.array(z.string()),
      configurado: z.boolean(),
    }),
  ),
  restricciones: z.object({
    soloAdministrador: z.array(z.string()),
    incompatibles: z.array(z.tuple([z.string(), z.string()])),
  }),
});

const usuarioDe = (request: FastifyRequest) => {
  if (!request.usuario) throw errores.noAutenticado();
  return request.usuario;
};

/** Permisos configurables por el dueño (§6.1, D169 a D171). */
export function rutasPermisos(app: FastifyInstance, prisma: PrismaClient): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  const vista = () => ({
    catalogo: [...PERMISOS],
    roles: ROLES.map((rol) => ({
      rol,
      permisos: [...permisosDeRol(rol)],
      deFabrica: [...permisosDeFabrica(rol)],
      configurado: esConfiguradoPorElDueno(rol),
    })),
    restricciones: {
      soloAdministrador: [...PERMISOS_SOLO_ADMINISTRADOR],
      incompatibles: PERMISOS_INCOMPATIBLES.map(([a, b]) => [a, b] as [string, string]),
    },
  });

  rutas.get(
    '/permisos',
    { config: CONFIGURAR, schema: { response: { 200: respuestaPermisos } } },
    () => Promise.resolve(vista()),
  );

  rutas.put(
    '/permisos/:rol',
    {
      config: CONFIGURAR,
      schema: {
        params: z.object({ rol: z.enum(ROLES) }),
        body: z.object({ permisos: z.array(z.string()).max(100) }).strict(),
        response: { 200: respuestaPermisos },
      },
    },
    async (request) => {
      const usuario = usuarioDe(request);
      const { rol } = request.params;
      const permisos = [...new Set(request.body.permisos)];
      const problemas = problemasDePermisos(rol, permisos);
      if (problemas.length > 0) {
        throw errores.estadoInvalido(problemas.join(' '));
      }
      const antes = [...permisosDeRol(rol)];
      await prisma.permisosRol.upsert({
        where: { rol },
        update: { permisos, actualizadoPor: usuario.id, actualizadoEn: new Date() },
        create: { rol, permisos, actualizadoPor: usuario.id },
      });
      await cargarPermisos(prisma);
      await registrarAuditoria(prisma, {
        usuarioId: usuario.id,
        accion: 'permiso.configurar',
        entidad: 'rol',
        entidadId: rol,
        ip: request.ip,
        agenteUsuario: request.headers['user-agent'] ?? null,
        antes: { permisos: antes },
        despues: { permisos: [...permisosDeRol(rol)] },
      });
      return vista();
    },
  );

  rutas.post(
    '/permisos/:rol/restablecer',
    {
      config: CONFIGURAR,
      schema: { params: z.object({ rol: z.enum(ROLES) }), response: { 200: respuestaPermisos } },
    },
    async (request) => {
      const usuario = usuarioDe(request);
      const { rol } = request.params;
      const antes = [...permisosDeRol(rol)];
      // Volver a fábrica es dejar de tener la elección del dueño (configuración, no un registro de negocio).
      await prisma.permisosRol.deleteMany({ where: { rol } });
      await cargarPermisos(prisma);
      await registrarAuditoria(prisma, {
        usuarioId: usuario.id,
        accion: 'permiso.restablecer',
        entidad: 'rol',
        entidadId: rol,
        ip: request.ip,
        agenteUsuario: request.headers['user-agent'] ?? null,
        antes: { permisos: antes },
        despues: { permisos: [...permisosDeRol(rol)] },
      });
      return vista();
    },
  );
}
