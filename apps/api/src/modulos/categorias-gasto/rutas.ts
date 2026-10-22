import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaCrearCategoriaGasto,
  esquemaEditarCategoriaGasto,
  esquemaId,
  esquemaListarCategoriasGasto,
  respuestaCategoriaGasto,
  respuestaListaCategoriasGasto,
} from './esquemas.js';
import type { ServicioCategoriasGasto } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const actorDe = (request: FastifyRequest): { id: string } => {
  if (!request.usuario) throw errores.noAutenticado();
  return { id: request.usuario.id };
};

const PERMISO = { permiso: 'empresa.configurar' } as const;

export function rutasCategoriasGasto(
  app: FastifyInstance,
  servicio: ServicioCategoriasGasto,
): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/categorias-gasto',
    {
      config: PERMISO,
      schema: {
        querystring: esquemaListarCategoriasGasto,
        response: { 200: respuestaListaCategoriasGasto },
      },
    },
    async (request) => ({ categorias: await servicio.listar(request.query) }),
  );

  rutas.post(
    '/categorias-gasto',
    {
      config: PERMISO,
      schema: { body: esquemaCrearCategoriaGasto, response: { 201: respuestaCategoriaGasto } },
    },
    async (request, respuesta) => {
      const categoria = await servicio.crear(request.body, actorDe(request), contextoDe(request));
      return respuesta.status(201).send({ categoria });
    },
  );

  rutas.patch(
    '/categorias-gasto/:id',
    {
      config: PERMISO,
      schema: {
        params: esquemaId,
        body: esquemaEditarCategoriaGasto,
        response: { 200: respuestaCategoriaGasto },
      },
    },
    async (request) => ({
      categoria: await servicio.editar(
        request.params.id,
        request.body,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/categorias-gasto/:id/desactivar',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaCategoriaGasto } } },
    async (request) => ({
      categoria: await servicio.desactivar(
        request.params.id,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/categorias-gasto/:id/reactivar',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaCategoriaGasto } } },
    async (request) => ({
      categoria: await servicio.reactivar(request.params.id, actorDe(request), contextoDe(request)),
    }),
  );
}
