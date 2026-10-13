import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaCrearCliente,
  esquemaCrearMedioPago,
  esquemaEditarCliente,
  esquemaId,
  esquemaIdMedio,
  esquemaListarClientes,
  respuestaCliente,
  respuestaListaClientes,
  respuestaMedioPago,
} from './esquemas.js';
import type { ServicioClientes } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const actorDe = (request: FastifyRequest): { id: string } => {
  if (!request.usuario) throw errores.noAutenticado();
  return { id: request.usuario.id };
};

const PERMISO = { permiso: 'cliente.registrar' } as const;

const ESTADOS = [
  ['desactivar', false],
  ['reactivar', true],
] as const;

export function rutasClientes(app: FastifyInstance, servicio: ServicioClientes): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/clientes',
    {
      config: PERMISO,
      schema: { querystring: esquemaListarClientes, response: { 200: respuestaListaClientes } },
    },
    async (request) => ({ clientes: await servicio.buscar(request.query) }),
  );

  rutas.post(
    '/clientes',
    { config: PERMISO, schema: { body: esquemaCrearCliente, response: { 201: respuestaCliente } } },
    async (request, respuesta) => {
      const cliente = await servicio.crear(request.body, actorDe(request), contextoDe(request));
      return respuesta.status(201).send({ cliente });
    },
  );

  rutas.get(
    '/clientes/:id',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaCliente } } },
    async (request) => ({ cliente: await servicio.obtener(request.params.id) }),
  );

  rutas.patch(
    '/clientes/:id',
    {
      config: PERMISO,
      schema: {
        params: esquemaId,
        body: esquemaEditarCliente,
        response: { 200: respuestaCliente },
      },
    },
    async (request) => ({
      cliente: await servicio.editar(
        request.params.id,
        request.body,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  for (const [accion, activo] of ESTADOS) {
    rutas.post(
      `/clientes/:id/${accion}`,
      { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaCliente } } },
      async (request) => ({
        cliente: await servicio.cambiarEstado(
          request.params.id,
          activo,
          actorDe(request),
          contextoDe(request),
        ),
      }),
    );
  }

  rutas.post(
    '/clientes/:id/medios-pago',
    {
      config: PERMISO,
      schema: {
        params: esquemaId,
        body: esquemaCrearMedioPago,
        response: { 201: respuestaMedioPago },
      },
    },
    async (request, respuesta) => {
      const medioPago = await servicio.agregarMedioPago(
        request.params.id,
        request.body,
        actorDe(request),
        contextoDe(request),
      );
      return respuesta.status(201).send({ medioPago });
    },
  );

  for (const [accion, activo] of ESTADOS) {
    rutas.post(
      `/clientes/:id/medios-pago/:medioId/${accion}`,
      {
        config: PERMISO,
        schema: { params: esquemaIdMedio, response: { 200: respuestaMedioPago } },
      },
      async (request) => ({
        medioPago: await servicio.cambiarEstadoMedioPago(
          request.params.id,
          request.params.medioId,
          activo,
          actorDe(request),
          contextoDe(request),
        ),
      }),
    );
  }
}
