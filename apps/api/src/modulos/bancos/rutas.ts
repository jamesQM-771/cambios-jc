import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaCrearBanco,
  esquemaEditarBanco,
  esquemaId,
  esquemaListarBancos,
  respuestaBanco,
  respuestaListaBancos,
} from './esquemas.js';
import type { ServicioBancos } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const actorDe = (request: FastifyRequest): { id: string } => {
  if (!request.usuario) throw errores.noAutenticado();
  return { id: request.usuario.id };
};

const PERMISO = { permiso: 'empresa.configurar' } as const;

export function rutasBancos(app: FastifyInstance, servicio: ServicioBancos): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/bancos',
    {
      config: PERMISO,
      schema: { querystring: esquemaListarBancos, response: { 200: respuestaListaBancos } },
    },
    async (request) => ({ bancos: await servicio.listar(request.query) }),
  );

  rutas.post(
    '/bancos',
    { config: PERMISO, schema: { body: esquemaCrearBanco, response: { 201: respuestaBanco } } },
    async (request, respuesta) => {
      const banco = await servicio.crear(request.body, actorDe(request), contextoDe(request));
      return respuesta.status(201).send({ banco });
    },
  );

  rutas.patch(
    '/bancos/:id',
    {
      config: PERMISO,
      schema: {
        params: esquemaId,
        body: esquemaEditarBanco,
        response: { 200: respuestaBanco },
      },
    },
    async (request) => ({
      banco: await servicio.editar(
        request.params.id,
        request.body,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/bancos/:id/desactivar',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaBanco } } },
    async (request) => ({
      banco: await servicio.desactivar(request.params.id, actorDe(request), contextoDe(request)),
    }),
  );

  rutas.post(
    '/bancos/:id/reactivar',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaBanco } } },
    async (request) => ({
      banco: await servicio.reactivar(request.params.id, actorDe(request), contextoDe(request)),
    }),
  );
}
