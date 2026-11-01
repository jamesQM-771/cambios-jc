import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaParametrosDobleControl,
  esquemaSolicitud,
  type ServicioAprobaciones,
} from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const usuarioDe = (request: FastifyRequest) => {
  if (!request.usuario) throw errores.noAutenticado();
  return request.usuario;
};

/** Bandeja de aprobaciones: supervisor o dueño; en Cambios JC, el administrador (D28). */
const APROBAR = { permiso: 'aprobacion.aprobar' } as const;
const esquemaId = z.object({ id: z.uuid() });
const respuesta = z.object({ solicitud: esquemaSolicitud });

export function rutasAprobaciones(app: FastifyInstance, servicio: ServicioAprobaciones): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/aprobaciones',
    {
      config: APROBAR,
      schema: {
        querystring: z.object({
          estado: z.enum(['pendiente', 'aprobada', 'rechazada']).optional(),
        }),
        response: { 200: z.object({ solicitudes: z.array(esquemaSolicitud) }) },
      },
    },
    async (request) => ({ solicitudes: await servicio.listar(request.query.estado) }),
  );

  rutas.get(
    '/aprobaciones/parametros',
    {
      config: APROBAR,
      schema: { response: { 200: z.object({ parametros: esquemaParametrosDobleControl }) } },
    },
    async () => ({ parametros: await servicio.parametros() }),
  );

  rutas.put(
    '/aprobaciones/parametros',
    {
      config: { permiso: 'empresa.configurar' },
      schema: {
        body: esquemaParametrosDobleControl,
        response: { 200: z.object({ parametros: esquemaParametrosDobleControl }) },
      },
    },
    async (request) => ({
      parametros: await servicio.guardarParametros(
        request.body,
        { id: usuarioDe(request).id },
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/aprobaciones/:id/aprobar',
    { config: APROBAR, schema: { params: esquemaId, response: { 200: respuesta } } },
    async (request) => {
      const { id, rol } = usuarioDe(request);
      return {
        solicitud: await servicio.aprobar(request.params.id, { id, rol }, contextoDe(request)),
      };
    },
  );

  rutas.post(
    '/aprobaciones/:id/rechazar',
    {
      config: APROBAR,
      schema: {
        params: esquemaId,
        body: z
          .object({ comentario: z.string().trim().min(3, 'Explica el rechazo.').max(300) })
          .strict(),
        response: { 200: respuesta },
      },
    },
    async (request) => {
      const { id, rol } = usuarioDe(request);
      return {
        solicitud: await servicio.rechazar(
          request.params.id,
          request.body.comentario,
          { id, rol },
          contextoDe(request),
        ),
      };
    },
  );
}
