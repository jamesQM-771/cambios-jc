import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaAnularCompra,
  esquemaId,
  esquemaListarCompras,
  esquemaRegistrarCompra,
  respuestaCompra,
  respuestaListaCompras,
  respuestaOpcionesCompra,
} from './esquemas.js';
import type { ServicioCompras } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const actorDe = (request: FastifyRequest) => {
  if (!request.usuario) throw errores.noAutenticado();
  return { id: request.usuario.id };
};

/** Comprar divisa a contrapartes es del administrador (§6.2). */
const COMPRAS = { permiso: 'compra_contraparte.registrar' } as const;

export function rutasCompras(app: FastifyInstance, servicio: ServicioCompras): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/compras/opciones',
    { config: COMPRAS, schema: { response: { 200: respuestaOpcionesCompra } } },
    async () => servicio.opciones(),
  );

  rutas.get(
    '/compras',
    {
      config: COMPRAS,
      schema: { querystring: esquemaListarCompras, response: { 200: respuestaListaCompras } },
    },
    async (request) => ({ compras: await servicio.listar(request.query) }),
  );

  rutas.get(
    '/compras/:id',
    { config: COMPRAS, schema: { params: esquemaId, response: { 200: respuestaCompra } } },
    async (request) => ({ compra: await servicio.obtener(request.params.id) }),
  );

  rutas.post(
    '/compras',
    {
      config: COMPRAS,
      schema: {
        body: esquemaRegistrarCompra,
        response: { 200: respuestaCompra, 201: respuestaCompra },
      },
    },
    async (request, respuesta) => {
      const resultado = await servicio.registrar(
        request.body,
        actorDe(request),
        contextoDe(request),
      );
      return respuesta.status(resultado.repetido ? 200 : 201).send({ compra: resultado.compra });
    },
  );

  rutas.post(
    '/compras/:id/anular',
    {
      config: COMPRAS,
      schema: { params: esquemaId, body: esquemaAnularCompra, response: { 200: respuestaCompra } },
    },
    async (request) => ({
      compra: await servicio.anular(
        request.params.id,
        request.body.motivo,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );
}
