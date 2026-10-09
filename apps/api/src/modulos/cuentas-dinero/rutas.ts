import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaCrearCuentaDinero,
  esquemaEditarCuentaDinero,
  esquemaId,
  esquemaListarCuentasDinero,
  respuestaCuentaDinero,
  respuestaListaCuentasDinero,
} from './esquemas.js';
import type { ServicioCuentasDinero } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const actorDe = (request: FastifyRequest): { id: string } => {
  if (!request.usuario) throw errores.noAutenticado();
  return { id: request.usuario.id };
};

const PERMISO = { permiso: 'empresa.configurar' } as const;

export function rutasCuentasDinero(app: FastifyInstance, servicio: ServicioCuentasDinero): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/cuentas-dinero',
    {
      config: PERMISO,
      schema: {
        querystring: esquemaListarCuentasDinero,
        response: { 200: respuestaListaCuentasDinero },
      },
    },
    async (request) => ({ cuentas: await servicio.listar(request.query) }),
  );

  rutas.post(
    '/cuentas-dinero',
    {
      config: PERMISO,
      schema: { body: esquemaCrearCuentaDinero, response: { 201: respuestaCuentaDinero } },
    },
    async (request, respuesta) => {
      const cuenta = await servicio.crear(request.body, actorDe(request), contextoDe(request));
      return respuesta.status(201).send({ cuenta });
    },
  );

  rutas.patch(
    '/cuentas-dinero/:id',
    {
      config: PERMISO,
      schema: {
        params: esquemaId,
        body: esquemaEditarCuentaDinero,
        response: { 200: respuestaCuentaDinero },
      },
    },
    async (request) => ({
      cuenta: await servicio.editar(
        request.params.id,
        request.body,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/cuentas-dinero/:id/desactivar',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaCuentaDinero } } },
    async (request) => ({
      cuenta: await servicio.desactivar(request.params.id, actorDe(request), contextoDe(request)),
    }),
  );

  rutas.post(
    '/cuentas-dinero/:id/reactivar',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaCuentaDinero } } },
    async (request) => ({
      cuenta: await servicio.reactivar(request.params.id, actorDe(request), contextoDe(request)),
    }),
  );
}
