import { tienePermiso } from '@cambios-jc/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import { respuestaSolicitud, type ServicioAprobaciones } from '../aprobaciones/servicio.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaAnularDivisa,
  esquemaId,
  esquemaListarDivisas,
  esquemaRegistrarDivisa,
  respuestaDivisa,
  respuestaListaDivisas,
  respuestaOpcionesDivisa,
  respuestaReciboDivisa,
} from './esquemas.js';
import type { Alcance, ServicioDivisas } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

function quien(request: FastifyRequest): { actor: { id: string }; alcance: Alcance } {
  if (!request.usuario) throw errores.noAutenticado();
  const { id, rol } = request.usuario;
  return {
    actor: { id },
    alcance: {
      verGanancia: tienePermiso(rol, 'ganancia.ver'),
      verTodas: tienePermiso(rol, 'divisa_caja.anular'),
      cambiarTasa: tienePermiso(rol, 'tasa.cambiar_en_operacion'),
    },
  };
}

/** Comprar y vender divisa en caja: vendedor y administrador (§6.2). */
const OPERAR = { permiso: 'divisa_caja.operar' } as const;
/** Anular y ver las de todos: solo el administrador. */
const ANULAR = { permiso: 'divisa_caja.anular' } as const;

export function rutasDivisas(
  app: FastifyInstance,
  servicio: ServicioDivisas,
  aprobaciones?: ServicioAprobaciones,
): void {
  const rutas = app.withTypeProvider<ProveedorZod>();
  // Al aprobar, anula quien aprueba: es el administrador, que ve todas las operaciones.
  aprobaciones?.registrarEjecutor('anular_divisa', (id, datos, actor, contexto) =>
    servicio.anular(
      id,
      String(datos.motivo),
      actor,
      { verGanancia: false, verTodas: true, cambiarTasa: false },
      contexto,
    ),
  );

  rutas.get(
    '/divisas/opciones',
    { config: OPERAR, schema: { response: { 200: respuestaOpcionesDivisa } } },
    async (request) => {
      const { actor, alcance } = quien(request);
      return servicio.opciones(actor, alcance);
    },
  );

  rutas.get(
    '/divisas',
    {
      config: OPERAR,
      schema: { querystring: esquemaListarDivisas, response: { 200: respuestaListaDivisas } },
    },
    async (request) => {
      const { actor, alcance } = quien(request);
      return { operaciones: await servicio.listar(request.query, actor, alcance) };
    },
  );

  rutas.get(
    '/divisas/:id',
    { config: OPERAR, schema: { params: esquemaId, response: { 200: respuestaDivisa } } },
    async (request) => {
      const { actor, alcance } = quien(request);
      return { operacion: await servicio.obtener(request.params.id, actor, alcance) };
    },
  );

  rutas.post(
    '/divisas',
    {
      config: OPERAR,
      schema: {
        body: esquemaRegistrarDivisa,
        response: { 200: respuestaDivisa, 201: respuestaDivisa },
      },
    },
    async (request, respuesta) => {
      const { actor, alcance } = quien(request);
      const resultado = await servicio.registrar(request.body, actor, alcance, contextoDe(request));
      return respuesta
        .status(resultado.repetido ? 200 : 201)
        .send({ operacion: resultado.operacion });
    },
  );

  rutas.post(
    '/divisas/:id/anular',
    {
      config: ANULAR,
      schema: {
        params: esquemaId,
        body: esquemaAnularDivisa,
        response: { 200: respuestaDivisa, 202: respuestaSolicitud },
      },
    },
    async (request, respuesta) => {
      const { actor, alcance } = quien(request);
      const solicitud = await aprobaciones?.interceptar(
        'anular_divisa',
        request.params.id,
        { motivo: request.body.motivo },
        `Anular una operación de divisas: ${request.body.motivo}`,
        actor,
        contextoDe(request),
      );
      if (solicitud) return respuesta.status(202).send({ solicitud });
      return {
        operacion: await servicio.anular(
          request.params.id,
          request.body.motivo,
          actor,
          alcance,
          contextoDe(request),
        ),
      };
    },
  );

  rutas.post(
    '/divisas/:id/imprimir',
    { config: OPERAR, schema: { params: esquemaId, response: { 200: respuestaReciboDivisa } } },
    async (request) => {
      const { actor, alcance } = quien(request);
      return { recibo: await servicio.imprimir(request.params.id, actor, alcance) };
    },
  );
}
