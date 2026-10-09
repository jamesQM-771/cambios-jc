import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaListarTasas,
  esquemaPublicarTasa,
  respuestaListaTasas,
  respuestaTasa,
} from './esquemas.js';
import type { ServicioTasas } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const actorDe = (request: FastifyRequest): { id: string } => {
  if (!request.usuario) throw errores.noAutenticado();
  return { id: request.usuario.id };
};

export function rutasTasas(app: FastifyInstance, servicio: ServicioTasas): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/tasas',
    {
      config: { permiso: 'tasa.publicar' },
      schema: { querystring: esquemaListarTasas, response: { 200: respuestaListaTasas } },
    },
    async (request) => ({ tasas: await servicio.listar(request.query) }),
  );

  rutas.post(
    '/tasas',
    {
      config: { permiso: 'tasa.publicar' },
      schema: { body: esquemaPublicarTasa, response: { 201: respuestaTasa } },
    },
    async (request, respuesta) => {
      const tasa = await servicio.publicar(request.body, actorDe(request), contextoDe(request));
      return respuesta.status(201).send({ tasa });
    },
  );
}
