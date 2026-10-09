import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaCrearLineaNegocio,
  esquemaEditarLineaNegocio,
  esquemaId,
  esquemaListarLineasNegocio,
  respuestaLineaNegocio,
  respuestaListaLineasNegocio,
} from './esquemas.js';
import type { ServicioLineasNegocio } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const actorDe = (request: FastifyRequest): { id: string } => {
  if (!request.usuario) throw errores.noAutenticado();
  return { id: request.usuario.id };
};

const PERMISO = { permiso: 'empresa.configurar' } as const;

export function rutasLineasNegocio(app: FastifyInstance, servicio: ServicioLineasNegocio): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/lineas-negocio',
    {
      config: PERMISO,
      schema: {
        querystring: esquemaListarLineasNegocio,
        response: { 200: respuestaListaLineasNegocio },
      },
    },
    async (request) => ({ lineasNegocio: await servicio.listar(request.query) }),
  );

  rutas.post(
    '/lineas-negocio',
    {
      config: PERMISO,
      schema: { body: esquemaCrearLineaNegocio, response: { 201: respuestaLineaNegocio } },
    },
    async (request, respuesta) => {
      const lineaNegocio = await servicio.crear(
        request.body,
        actorDe(request),
        contextoDe(request),
      );
      return respuesta.status(201).send({ lineaNegocio });
    },
  );

  rutas.patch(
    '/lineas-negocio/:id',
    {
      config: PERMISO,
      schema: {
        params: esquemaId,
        body: esquemaEditarLineaNegocio,
        response: { 200: respuestaLineaNegocio },
      },
    },
    async (request) => ({
      lineaNegocio: await servicio.editar(
        request.params.id,
        request.body,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/lineas-negocio/:id/desactivar',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaLineaNegocio } } },
    async (request) => ({
      lineaNegocio: await servicio.desactivar(
        request.params.id,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/lineas-negocio/:id/reactivar',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaLineaNegocio } } },
    async (request) => ({
      lineaNegocio: await servicio.reactivar(
        request.params.id,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );
}
