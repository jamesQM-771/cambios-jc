import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaCrearSucursal,
  esquemaEditarSucursal,
  esquemaId,
  esquemaListarSucursales,
  respuestaListaSucursales,
  respuestaSucursal,
} from './esquemas.js';
import type { ServicioSucursales } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const actorDe = (request: FastifyRequest): { id: string } => {
  if (!request.usuario) throw errores.noAutenticado();
  return { id: request.usuario.id };
};

const PERMISO = { permiso: 'empresa.configurar' } as const;

export function rutasSucursales(app: FastifyInstance, servicio: ServicioSucursales): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/sucursales',
    {
      config: PERMISO,
      schema: { querystring: esquemaListarSucursales, response: { 200: respuestaListaSucursales } },
    },
    async (request) => ({ sucursales: await servicio.listar(request.query) }),
  );

  rutas.post(
    '/sucursales',
    {
      config: PERMISO,
      schema: { body: esquemaCrearSucursal, response: { 201: respuestaSucursal } },
    },
    async (request, respuesta) => {
      const sucursal = await servicio.crear(request.body, actorDe(request), contextoDe(request));
      return respuesta.status(201).send({ sucursal });
    },
  );

  rutas.patch(
    '/sucursales/:id',
    {
      config: PERMISO,
      schema: {
        params: esquemaId,
        body: esquemaEditarSucursal,
        response: { 200: respuestaSucursal },
      },
    },
    async (request) => ({
      sucursal: await servicio.editar(
        request.params.id,
        request.body,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/sucursales/:id/desactivar',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaSucursal } } },
    async (request) => ({
      sucursal: await servicio.desactivar(request.params.id, actorDe(request), contextoDe(request)),
    }),
  );

  rutas.post(
    '/sucursales/:id/reactivar',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaSucursal } } },
    async (request) => ({
      sucursal: await servicio.reactivar(request.params.id, actorDe(request), contextoDe(request)),
    }),
  );
}
