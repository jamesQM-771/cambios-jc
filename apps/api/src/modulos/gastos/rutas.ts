import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import { respuestaSolicitud, type ServicioAprobaciones } from '../aprobaciones/servicio.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaAnularGasto,
  esquemaId,
  esquemaListarGastos,
  esquemaOpcionesGasto,
  esquemaRegistrarGasto,
  respuestaGasto,
  respuestaListaGastos,
} from './esquemas.js';
import type { ServicioGastos } from './servicio.js';
import { tienePermiso } from '../../lib/permisos.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const usuarioDe = (request: FastifyRequest) => {
  if (!request.usuario) throw errores.noAutenticado();
  return request.usuario;
};

const REGISTRAR = { permiso: 'gasto.registrar' } as const;
/** Ver todos los gastos, pagar desde cualquier cuenta, registrar retiros y anular es del administrador. */
const GESTIONAR = { permiso: 'gasto.gestionar' } as const;

export function rutasGastos(
  app: FastifyInstance,
  servicio: ServicioGastos,
  aprobaciones?: ServicioAprobaciones,
): void {
  const rutas = app.withTypeProvider<ProveedorZod>();
  aprobaciones?.registrarEjecutor('anular_gasto', (id, datos, actor, contexto) =>
    servicio.anular(id, String(datos.motivo), actor, contexto),
  );

  rutas.get(
    '/gastos/opciones',
    { config: REGISTRAR, schema: { response: { 200: esquemaOpcionesGasto } } },
    async (request) => {
      const usuario = usuarioDe(request);
      return servicio.opciones({ id: usuario.id }, tienePermiso(usuario.rol, 'gasto.gestionar'));
    },
  );

  rutas.get(
    '/gastos',
    {
      config: GESTIONAR,
      schema: { querystring: esquemaListarGastos, response: { 200: respuestaListaGastos } },
    },
    async (request) => ({ gastos: await servicio.listar(request.query) }),
  );

  rutas.get(
    '/gastos/:id',
    { config: GESTIONAR, schema: { params: esquemaId, response: { 200: respuestaGasto } } },
    async (request) => ({ gasto: await servicio.obtener(request.params.id) }),
  );

  rutas.post(
    '/gastos',
    {
      config: REGISTRAR,
      schema: {
        body: esquemaRegistrarGasto,
        response: { 200: respuestaGasto, 201: respuestaGasto },
      },
    },
    async (request, respuesta) => {
      const usuario = usuarioDe(request);
      const resultado = await servicio.registrar(
        request.body,
        { id: usuario.id },
        tienePermiso(usuario.rol, 'gasto.gestionar'),
        contextoDe(request),
      );
      // 201 al crear; 200 si era un reintento de un gasto que ya existía.
      return respuesta.status(resultado.repetido ? 200 : 201).send({ gasto: resultado.gasto });
    },
  );

  rutas.post(
    '/gastos/:id/anular',
    {
      config: GESTIONAR,
      schema: {
        params: esquemaId,
        body: esquemaAnularGasto,
        response: { 200: respuestaGasto, 202: respuestaSolicitud },
      },
    },
    async (request, respuesta) => {
      const solicitud = await aprobaciones?.interceptar(
        'anular_gasto',
        request.params.id,
        { motivo: request.body.motivo },
        `Anular un gasto: ${request.body.motivo}`,
        { id: usuarioDe(request).id },
        contextoDe(request),
      );
      if (solicitud) return respuesta.status(202).send({ solicitud });
      return {
        gasto: await servicio.anular(
          request.params.id,
          request.body.motivo,
          { id: usuarioDe(request).id },
          contextoDe(request),
        ),
      };
    },
  );
}
