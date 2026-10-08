import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaCrearUsuario,
  esquemaEditarUsuario,
  esquemaId,
  esquemaListarUsuarios,
  respuestaConContrasenaTemporal,
  respuestaListaUsuarios,
  respuestaOk,
  respuestaSesionesCerradas,
  respuestaUsuario,
} from './esquemas.js';
import type { ServicioUsuarios } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const actorDe = (request: FastifyRequest) => {
  // Las rutas con permiso siempre llegan con usuario; esto lo hace explícito para TypeScript.
  if (!request.usuario) throw errores.noAutenticado();
  return { id: request.usuario.id };
};

const PERMISO = { permiso: 'usuario.gestionar' } as const;

export function rutasUsuarios(app: FastifyInstance, servicio: ServicioUsuarios): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/usuarios',
    {
      config: PERMISO,
      schema: { querystring: esquemaListarUsuarios, response: { 200: respuestaListaUsuarios } },
    },
    (request) => servicio.listar(request.query),
  );

  rutas.get(
    '/usuarios/:id',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaUsuario } } },
    async (request) => ({ usuario: await servicio.obtener(request.params.id) }),
  );

  rutas.post(
    '/usuarios',
    {
      config: PERMISO,
      schema: { body: esquemaCrearUsuario, response: { 201: respuestaConContrasenaTemporal } },
    },
    async (request, respuesta) => {
      const resultado = await servicio.crear(request.body, actorDe(request), contextoDe(request));
      return respuesta.status(201).send(resultado);
    },
  );

  rutas.patch(
    '/usuarios/:id',
    {
      config: PERMISO,
      schema: {
        params: esquemaId,
        body: esquemaEditarUsuario,
        response: { 200: respuestaUsuario },
      },
    },
    async (request) => ({
      usuario: await servicio.editar(
        request.params.id,
        request.body,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/usuarios/:id/desactivar',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaUsuario } } },
    async (request) => ({
      usuario: await servicio.desactivar(request.params.id, actorDe(request), contextoDe(request)),
    }),
  );

  rutas.post(
    '/usuarios/:id/reactivar',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaUsuario } } },
    async (request) => ({
      usuario: await servicio.reactivar(request.params.id, actorDe(request), contextoDe(request)),
    }),
  );

  rutas.post(
    '/usuarios/:id/restablecer-contrasena',
    {
      config: PERMISO,
      schema: { params: esquemaId, response: { 200: respuestaConContrasenaTemporal } },
    },
    (request) =>
      servicio.restablecerContrasena(request.params.id, actorDe(request), contextoDe(request)),
  );

  rutas.post(
    '/usuarios/:id/reiniciar-2fa',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaOk } } },
    async (request) => {
      await servicio.reiniciar2fa(request.params.id, actorDe(request), contextoDe(request));
      return { ok: true as const };
    },
  );

  rutas.post(
    '/usuarios/:id/cerrar-sesiones',
    {
      config: PERMISO,
      schema: { params: esquemaId, response: { 200: respuestaSesionesCerradas } },
    },
    async (request) => ({
      sesionesCerradas: await servicio.cerrarSesiones(
        request.params.id,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );
}
