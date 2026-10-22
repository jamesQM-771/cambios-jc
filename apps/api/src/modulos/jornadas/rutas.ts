import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaCerrarJornada,
  esquemaId,
  esquemaListarJornadas,
  esquemaReabrirJornada,
  respuestaDetalleJornada,
  respuestaListaJornadas,
} from './esquemas.js';
import type { ServicioJornadas } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const actorDe = (request: FastifyRequest): { id: string } => {
  if (!request.usuario) throw errores.noAutenticado();
  return { id: request.usuario.id };
};

/** Cerrar y consultar la jornada es de quien cierra el día (el administrador). */
const CERRAR = { permiso: 'jornada.cerrar' } as const;
/** Reabrir un cierre solo lo puede el administrador, sin importar cómo se configuren los demás roles. */
const REABRIR = { permiso: 'caja.reabrir' } as const;

export function rutasJornadas(app: FastifyInstance, servicio: ServicioJornadas): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/jornadas',
    {
      config: CERRAR,
      schema: { querystring: esquemaListarJornadas, response: { 200: respuestaListaJornadas } },
    },
    async (request) => ({ jornadas: await servicio.listar(request.query) }),
  );

  rutas.get(
    '/jornadas/:id',
    { config: CERRAR, schema: { params: esquemaId, response: { 200: respuestaDetalleJornada } } },
    async (request) => ({ detalle: await servicio.detalle(request.params.id) }),
  );

  rutas.post(
    '/jornadas/:id/cerrar',
    {
      config: CERRAR,
      schema: {
        params: esquemaId,
        body: esquemaCerrarJornada,
        response: { 200: respuestaDetalleJornada },
      },
    },
    async (request) => ({
      detalle: await servicio.cerrar(
        request.params.id,
        request.body,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/jornadas/:id/reabrir',
    {
      config: REABRIR,
      schema: {
        params: esquemaId,
        body: esquemaReabrirJornada,
        response: { 200: respuestaDetalleJornada },
      },
    },
    async (request) => ({
      detalle: await servicio.reabrir(
        request.params.id,
        request.body.motivo,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );
}
