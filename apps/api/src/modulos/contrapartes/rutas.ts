import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import { respuestaSolicitud, type ServicioAprobaciones } from '../aprobaciones/servicio.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaAnularMovimiento,
  esquemaCrearContraparte,
  esquemaEditarContraparte,
  esquemaId,
  esquemaListarContrapartes,
  esquemaRegistrarMovimiento,
  respuestaContraparte,
  respuestaDetalleContraparte,
  respuestaListaContrapartes,
  respuestaMovimiento,
  respuestaOpcionesContraparte,
  respuestaResumenContrapartes,
} from './esquemas.js';
import type { ServicioContrapartes } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const actorDe = (request: FastifyRequest) => {
  if (!request.usuario) throw errores.noAutenticado();
  return { id: request.usuario.id };
};

/** Catálogo y cuenta corriente de las contrapartes: solo el administrador (§6.2). */
const CONTRAPARTES = { permiso: 'contraparte.registrar_movimiento' } as const;

export function rutasContrapartes(
  app: FastifyInstance,
  servicio: ServicioContrapartes,
  aprobaciones?: ServicioAprobaciones,
): void {
  const rutas = app.withTypeProvider<ProveedorZod>();
  aprobaciones?.registrarEjecutor('ajuste_contraparte', (id, datos, actor, contexto) =>
    servicio.registrarMovimiento(id, esquemaRegistrarMovimiento.parse(datos), actor, contexto),
  );

  rutas.get(
    '/contrapartes',
    {
      config: CONTRAPARTES,
      schema: {
        querystring: esquemaListarContrapartes,
        response: { 200: respuestaListaContrapartes },
      },
    },
    async (request) => ({ contrapartes: await servicio.listar(request.query) }),
  );

  rutas.get(
    '/contrapartes/resumen',
    { config: CONTRAPARTES, schema: { response: { 200: respuestaResumenContrapartes } } },
    async () => ({ resumen: await servicio.resumen() }),
  );

  rutas.get(
    '/contrapartes/opciones',
    { config: CONTRAPARTES, schema: { response: { 200: respuestaOpcionesContraparte } } },
    async () => servicio.opciones(),
  );

  rutas.get(
    '/contrapartes/:id',
    {
      config: CONTRAPARTES,
      schema: { params: esquemaId, response: { 200: respuestaDetalleContraparte } },
    },
    async (request) => servicio.detalle(request.params.id),
  );

  rutas.post(
    '/contrapartes',
    {
      config: CONTRAPARTES,
      schema: { body: esquemaCrearContraparte, response: { 201: respuestaContraparte } },
    },
    async (request, respuesta) =>
      respuesta.status(201).send({
        contraparte: await servicio.crear(request.body, actorDe(request), contextoDe(request)),
      }),
  );

  rutas.patch(
    '/contrapartes/:id',
    {
      config: CONTRAPARTES,
      schema: {
        params: esquemaId,
        body: esquemaEditarContraparte,
        response: { 200: respuestaContraparte },
      },
    },
    async (request) => ({
      contraparte: await servicio.editar(
        request.params.id,
        request.body,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/contrapartes/:id/movimientos',
    {
      config: CONTRAPARTES,
      schema: {
        params: esquemaId,
        body: esquemaRegistrarMovimiento,
        response: { 200: respuestaMovimiento, 201: respuestaMovimiento, 202: respuestaSolicitud },
      },
    },
    async (request, respuesta) => {
      if (request.body.tipo === 'ajuste') {
        const solicitud = await aprobaciones?.interceptar(
          'ajuste_contraparte',
          request.params.id,
          { ...request.body },
          `Ajuste de ${request.body.monto} ${request.body.moneda} en una contraparte: ${request.body.nota ?? ''}`,
          actorDe(request),
          contextoDe(request),
        );
        if (solicitud) return respuesta.status(202).send({ solicitud });
      }
      const resultado = await servicio.registrarMovimiento(
        request.params.id,
        request.body,
        actorDe(request),
        contextoDe(request),
      );
      return respuesta
        .status(resultado.repetido ? 200 : 201)
        .send({ movimiento: resultado.movimiento });
    },
  );

  rutas.post(
    '/contrapartes/movimientos/:id/anular',
    {
      config: CONTRAPARTES,
      schema: {
        params: esquemaId,
        body: esquemaAnularMovimiento,
        response: { 200: respuestaMovimiento },
      },
    },
    async (request) => ({
      movimiento: await servicio.anularMovimiento(
        request.params.id,
        request.body.motivo,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );
}
