import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaCrearCaja,
  esquemaEditarCaja,
  esquemaId,
  esquemaListarCajas,
  respuestaCaja,
  respuestaListaCajas,
} from './esquemas.js';
import type { ServicioCajas } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const actorDe = (request: FastifyRequest): { id: string } => {
  if (!request.usuario) throw errores.noAutenticado();
  return { id: request.usuario.id };
};

const PERMISO = { permiso: 'empresa.configurar' } as const;

export function rutasCajas(app: FastifyInstance, servicio: ServicioCajas): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/cajas',
    {
      config: PERMISO,
      schema: { querystring: esquemaListarCajas, response: { 200: respuestaListaCajas } },
    },
    async (request) => ({ cajas: await servicio.listar(request.query) }),
  );

  rutas.post(
    '/cajas',
    { config: PERMISO, schema: { body: esquemaCrearCaja, response: { 201: respuestaCaja } } },
    async (request, respuesta) => {
      const caja = await servicio.crear(request.body, actorDe(request), contextoDe(request));
      return respuesta.status(201).send({ caja });
    },
  );

  rutas.patch(
    '/cajas/:id',
    {
      config: PERMISO,
      schema: { params: esquemaId, body: esquemaEditarCaja, response: { 200: respuestaCaja } },
    },
    async (request) => ({
      caja: await servicio.editar(
        request.params.id,
        request.body,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/cajas/:id/desactivar',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaCaja } } },
    async (request) => ({
      caja: await servicio.desactivar(request.params.id, actorDe(request), contextoDe(request)),
    }),
  );

  rutas.post(
    '/cajas/:id/reactivar',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaCaja } } },
    async (request) => ({
      caja: await servicio.reactivar(request.params.id, actorDe(request), contextoDe(request)),
    }),
  );
}
