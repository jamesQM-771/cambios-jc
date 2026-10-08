import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaCrearDenominacion,
  esquemaEditarDenominacion,
  esquemaId,
  esquemaListarDenominaciones,
  respuestaDenominacion,
  respuestaListaDenominaciones,
} from './esquemas.js';
import type { ServicioDenominaciones } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const actorDe = (request: FastifyRequest): { id: string } => {
  if (!request.usuario) throw errores.noAutenticado();
  return { id: request.usuario.id };
};

const PERMISO = { permiso: 'empresa.configurar' } as const;

export function rutasDenominaciones(app: FastifyInstance, servicio: ServicioDenominaciones): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/denominaciones',
    {
      config: PERMISO,
      schema: {
        querystring: esquemaListarDenominaciones,
        response: { 200: respuestaListaDenominaciones },
      },
    },
    async (request) => ({ denominaciones: await servicio.listar(request.query) }),
  );

  rutas.post(
    '/denominaciones',
    {
      config: PERMISO,
      schema: { body: esquemaCrearDenominacion, response: { 201: respuestaDenominacion } },
    },
    async (request, respuesta) => {
      const denominacion = await servicio.crear(
        request.body,
        actorDe(request),
        contextoDe(request),
      );
      return respuesta.status(201).send({ denominacion });
    },
  );

  rutas.patch(
    '/denominaciones/:id',
    {
      config: PERMISO,
      schema: {
        params: esquemaId,
        body: esquemaEditarDenominacion,
        response: { 200: respuestaDenominacion },
      },
    },
    async (request) => ({
      denominacion: await servicio.editar(
        request.params.id,
        request.body,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/denominaciones/:id/desactivar',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaDenominacion } } },
    async (request) => ({
      denominacion: await servicio.desactivar(
        request.params.id,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/denominaciones/:id/reactivar',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaDenominacion } } },
    async (request) => ({
      denominacion: await servicio.reactivar(
        request.params.id,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );
}
