import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import { respuestaSolicitud, type ServicioAprobaciones } from '../aprobaciones/servicio.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaAnularTraslado,
  esquemaId,
  esquemaListarTraslados,
  esquemaOpcionesTraslado,
  esquemaRegistrarTraslado,
  respuestaListaTraslados,
  respuestaTraslado,
} from './esquemas.js';
import type { ServicioTraslados } from './servicio.js';
import { tienePermiso } from '../../lib/permisos.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const usuarioDe = (request: FastifyRequest) => {
  if (!request.usuario) throw errores.noAutenticado();
  return request.usuario;
};

const REGISTRAR = { permiso: 'traslado.registrar' } as const;
/** Ver todos los traslados, mover entre cualesquiera cuentas y anular es del administrador. */
const GESTIONAR = { permiso: 'traslado.gestionar' } as const;

export function rutasTraslados(
  app: FastifyInstance,
  servicio: ServicioTraslados,
  aprobaciones?: ServicioAprobaciones,
): void {
  const rutas = app.withTypeProvider<ProveedorZod>();
  aprobaciones?.registrarEjecutor('anular_traslado', (id, datos, actor, contexto) =>
    servicio.anular(id, String(datos.motivo), actor, contexto),
  );

  rutas.get(
    '/traslados/opciones',
    { config: REGISTRAR, schema: { response: { 200: esquemaOpcionesTraslado } } },
    async (request) => {
      const usuario = usuarioDe(request);
      return servicio.opciones({ id: usuario.id }, tienePermiso(usuario.rol, 'traslado.gestionar'));
    },
  );

  rutas.get(
    '/traslados',
    {
      config: GESTIONAR,
      schema: { querystring: esquemaListarTraslados, response: { 200: respuestaListaTraslados } },
    },
    async (request) => ({ traslados: await servicio.listar(request.query) }),
  );

  rutas.get(
    '/traslados/:id',
    { config: GESTIONAR, schema: { params: esquemaId, response: { 200: respuestaTraslado } } },
    async (request) => ({ traslado: await servicio.obtener(request.params.id) }),
  );

  rutas.post(
    '/traslados',
    {
      config: REGISTRAR,
      schema: {
        body: esquemaRegistrarTraslado,
        response: { 200: respuestaTraslado, 201: respuestaTraslado },
      },
    },
    async (request, respuesta) => {
      const usuario = usuarioDe(request);
      const resultado = await servicio.registrar(
        request.body,
        { id: usuario.id },
        tienePermiso(usuario.rol, 'traslado.gestionar'),
        contextoDe(request),
      );
      // 201 al crear; 200 si era un reintento de un traslado que ya existía.
      return respuesta
        .status(resultado.repetido ? 200 : 201)
        .send({ traslado: resultado.traslado });
    },
  );

  rutas.post(
    '/traslados/:id/anular',
    {
      config: GESTIONAR,
      schema: {
        params: esquemaId,
        body: esquemaAnularTraslado,
        response: { 200: respuestaTraslado, 202: respuestaSolicitud },
      },
    },
    async (request, respuesta) => {
      const solicitud = await aprobaciones?.interceptar(
        'anular_traslado',
        request.params.id,
        { motivo: request.body.motivo },
        `Anular un traslado: ${request.body.motivo}`,
        { id: usuarioDe(request).id },
        contextoDe(request),
      );
      if (solicitud) return respuesta.status(202).send({ solicitud });
      return {
        traslado: await servicio.anular(
          request.params.id,
          request.body.motivo,
          { id: usuarioDe(request).id },
          contextoDe(request),
        ),
      };
    },
  );
}
