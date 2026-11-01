import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import { respuestaSolicitud, type ServicioAprobaciones } from '../aprobaciones/servicio.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaAnularRemesa,
  esquemaDevolverRemesa,
  esquemaCorregirRemesa,
  esquemaId,
  esquemaListarRemesas,
  esquemaRegistrarRemesa,
  respuestaHistorialRemesa,
  esquemaOpcionesRemesa,
  respuestaListaRemesas,
  respuestaGananciaRemesa,
  respuestaRemesa,
} from './esquemas.js';
import type { ServicioRemesas } from './servicio.js';
import { tienePermiso } from '../../lib/permisos.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const PERMISO = { permiso: 'remesa.registrar' } as const;

const actorDe = (request: FastifyRequest): { id: string } => {
  if (!request.usuario) throw errores.noAutenticado();
  return { id: request.usuario.id };
};

export function rutasRemesas(
  app: FastifyInstance,
  servicio: ServicioRemesas,
  aprobaciones?: ServicioAprobaciones,
): void {
  const rutas = app.withTypeProvider<ProveedorZod>();
  aprobaciones?.registrarEjecutor('devolver_remesa', (id, datos, actor, contexto) =>
    servicio.devolver(id, String(datos.motivo), actor, contexto),
  );
  aprobaciones?.registrarEjecutor('anular_remesa', (id, datos, actor, contexto) =>
    servicio.anular(id, String(datos.motivo), actor, contexto),
  );

  rutas.post(
    '/remesas',
    {
      config: PERMISO,
      schema: {
        body: esquemaRegistrarRemesa,
        response: { 200: respuestaRemesa, 201: respuestaRemesa },
      },
    },
    async (request, respuesta) => {
      const { usuario } = request;
      if (!usuario) throw errores.noAutenticado();
      const resultado = await servicio.registrar(
        request.body,
        { id: usuario.id },
        tienePermiso(usuario.rol, 'tasa.cambiar_en_operacion'),
        contextoDe(request),
      );
      // 201 al crear; 200 si era un reintento de una remesa que ya existía.
      return respuesta.status(resultado.repetida ? 200 : 201).send({ remesa: resultado.remesa });
    },
  );

  rutas.get(
    '/remesas',
    {
      config: PERMISO,
      schema: { querystring: esquemaListarRemesas, response: { 200: respuestaListaRemesas } },
    },
    async (request) => ({ remesas: await servicio.listar(request.query) }),
  );

  rutas.get(
    '/remesas/opciones',
    { config: PERMISO, schema: { response: { 200: esquemaOpcionesRemesa } } },
    async (request) => servicio.opciones(actorDe(request)),
  );

  rutas.get(
    '/remesas/:id/historial',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaHistorialRemesa } } },
    async (request) => ({ historial: await servicio.historial(request.params.id) }),
  );

  rutas.get(
    '/remesas/:id/ganancia',
    {
      config: { permiso: 'ganancia.ver' },
      schema: { params: esquemaId, response: { 200: respuestaGananciaRemesa } },
    },
    async (request) => ({ ganancia: await servicio.ganancia(request.params.id) }),
  );

  rutas.post(
    '/remesas/:id/verificar-pago',
    {
      config: { permiso: 'remesa.verificar_pago' },
      schema: { params: esquemaId, response: { 200: respuestaRemesa } },
    },
    async (request) => ({
      remesa: await servicio.verificarPago(
        request.params.id,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/remesas/:id/anular',
    {
      config: { permiso: 'remesa.anular' },
      schema: {
        params: esquemaId,
        body: esquemaAnularRemesa,
        response: { 200: respuestaRemesa, 202: respuestaSolicitud },
      },
    },
    async (request, respuesta) => {
      const solicitud = await aprobaciones?.interceptar(
        'anular_remesa',
        request.params.id,
        { motivo: request.body.motivo },
        `Anular una remesa: ${request.body.motivo}`,
        actorDe(request),
        contextoDe(request),
      );
      if (solicitud) return respuesta.status(202).send({ solicitud });
      return {
        remesa: await servicio.anular(
          request.params.id,
          request.body.motivo,
          actorDe(request),
          contextoDe(request),
        ),
      };
    },
  );

  rutas.post(
    '/remesas/:id/devolver',
    {
      config: { permiso: 'remesa.devolver' },
      schema: {
        params: esquemaId,
        body: esquemaDevolverRemesa,
        response: { 200: respuestaRemesa, 202: respuestaSolicitud },
      },
    },
    async (request, respuesta) => {
      const solicitud = await aprobaciones?.interceptar(
        'devolver_remesa',
        request.params.id,
        { motivo: request.body.motivo },
        `Devolver el dinero de una remesa: ${request.body.motivo}`,
        actorDe(request),
        contextoDe(request),
      );
      if (solicitud) return respuesta.status(202).send({ solicitud });
      return {
        remesa: await servicio.devolver(
          request.params.id,
          request.body.motivo,
          actorDe(request),
          contextoDe(request),
        ),
      };
    },
  );

  rutas.post(
    '/remesas/:id/corregir',
    {
      config: PERMISO,
      schema: {
        params: esquemaId,
        body: esquemaCorregirRemesa,
        response: { 200: respuestaRemesa },
      },
    },
    async (request) => ({
      remesa: await servicio.corregirPago(
        request.params.id,
        request.body,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/remesas/:id/liberar',
    {
      config: { permiso: 'remesa.liberar' },
      schema: { params: esquemaId, response: { 200: respuestaRemesa } },
    },
    async (request) => ({
      remesa: await servicio.liberar(request.params.id, actorDe(request), contextoDe(request)),
    }),
  );

  rutas.get(
    '/remesas/:id/comprobante',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: z.unknown() } } },
    async (request, respuesta) => {
      const comprobante = await servicio.abrirComprobante(request.params.id);
      return respuesta
        .header('content-type', comprobante.mime)
        .header('content-length', comprobante.tamano)
        .header('cache-control', 'private, no-store')
        .send(comprobante.flujo);
    },
  );

  rutas.get(
    '/remesas/:id',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaRemesa } } },
    async (request) => ({ remesa: await servicio.obtener(request.params.id) }),
  );
}
