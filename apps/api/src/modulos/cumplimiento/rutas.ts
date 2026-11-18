import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaCrearEntrada,
  esquemaEditarEntrada,
  esquemaExporte,
  esquemaFicha,
  esquemaId,
  esquemaListarAlertas,
  esquemaNivel,
  esquemaParametros,
  esquemaResolverAlerta,
  respuestaAlerta,
  respuestaAlertas,
  respuestaCumplimientoCliente,
  respuestaEntrada,
  respuestaLista,
  respuestaParametros,
} from './esquemas.js';
import type { ServicioCumplimiento } from './servicio.js';
import { tienePermiso } from '../../lib/permisos.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const usuarioDe = (request: FastifyRequest) => {
  if (!request.usuario) throw errores.noAutenticado();
  return request.usuario;
};

/** Bandeja, lista restrictiva, parámetros, nivel de riesgo y exportes: el administrador (D28). */
const GESTIONAR = { permiso: 'cumplimiento.gestionar_alertas' } as const;
/** La ficha ampliada la llena quien atiende al cliente. */
const FICHA = { permiso: 'cliente.registrar' } as const;

const vacio = z.object({ ok: z.literal(true) });

export function rutasCumplimiento(app: FastifyInstance, servicio: ServicioCumplimiento): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/cumplimiento/parametros',
    { config: GESTIONAR, schema: { response: { 200: respuestaParametros } } },
    async () => ({ parametros: await servicio.parametros() }),
  );

  rutas.put(
    '/cumplimiento/parametros',
    {
      config: GESTIONAR,
      schema: { body: esquemaParametros, response: { 200: respuestaParametros } },
    },
    async (request) => ({
      parametros: await servicio.guardarParametros(
        request.body,
        { id: usuarioDe(request).id },
        contextoDe(request),
      ),
    }),
  );

  rutas.get(
    '/cumplimiento/lista',
    { config: GESTIONAR, schema: { response: { 200: respuestaLista } } },
    async () => ({ entradas: await servicio.listarEntradas() }),
  );

  rutas.post(
    '/cumplimiento/lista',
    {
      config: GESTIONAR,
      schema: { body: esquemaCrearEntrada, response: { 201: respuestaEntrada } },
    },
    async (request, respuesta) =>
      respuesta.status(201).send({
        entrada: await servicio.crearEntrada(
          request.body,
          { id: usuarioDe(request).id },
          contextoDe(request),
        ),
      }),
  );

  rutas.patch(
    '/cumplimiento/lista/:id',
    {
      config: GESTIONAR,
      schema: {
        params: esquemaId,
        body: esquemaEditarEntrada,
        response: { 200: respuestaEntrada },
      },
    },
    async (request) => ({
      entrada: await servicio.editarEntrada(
        request.params.id,
        request.body.activa,
        { id: usuarioDe(request).id },
        contextoDe(request),
      ),
    }),
  );

  rutas.get(
    '/cumplimiento/alertas',
    {
      config: GESTIONAR,
      schema: { querystring: esquemaListarAlertas, response: { 200: respuestaAlertas } },
    },
    async (request) => ({ alertas: await servicio.listarAlertas(request.query) }),
  );

  for (const [accion, estado] of [
    ['descartar', 'descartada'],
    ['escalar', 'escalada'],
  ] as const) {
    rutas.post(
      `/cumplimiento/alertas/:id/${accion}`,
      {
        config: GESTIONAR,
        schema: {
          params: esquemaId,
          body: esquemaResolverAlerta,
          response: { 200: respuestaAlerta },
        },
      },
      async (request) => ({
        alerta: await servicio.resolverAlerta(
          request.params.id,
          estado,
          request.body.justificacion,
          { id: usuarioDe(request).id },
          contextoDe(request),
        ),
      }),
    );
  }

  rutas.get(
    '/cumplimiento/clientes/:id',
    {
      config: FICHA,
      schema: { params: esquemaId, response: { 200: respuestaCumplimientoCliente } },
    },
    async (request) =>
      servicio.cliente(
        request.params.id,
        tienePermiso(usuarioDe(request).rol, 'cumplimiento.gestionar_alertas'),
      ),
  );

  rutas.put(
    '/cumplimiento/clientes/:id/ficha',
    { config: FICHA, schema: { params: esquemaId, body: esquemaFicha, response: { 200: vacio } } },
    async (request) => {
      await servicio.guardarFicha(
        request.params.id,
        request.body,
        { id: usuarioDe(request).id },
        contextoDe(request),
      );
      return { ok: true as const };
    },
  );

  rutas.put(
    '/cumplimiento/clientes/:id/nivel',
    {
      config: GESTIONAR,
      schema: { params: esquemaId, body: esquemaNivel, response: { 200: vacio } },
    },
    async (request) => {
      await servicio.guardarNivel(
        request.params.id,
        request.body,
        { id: usuarioDe(request).id },
        contextoDe(request),
      );
      return { ok: true as const };
    },
  );

  rutas.get(
    '/cumplimiento/exportes/operaciones',
    {
      config: GESTIONAR,
      schema: { querystring: esquemaExporte, response: { 200: z.string() } },
    },
    async (request, respuesta) => {
      const csv = await servicio.exportarOperaciones(request.query);
      return respuesta
        .header('content-type', 'text/csv; charset=utf-8')
        .header(
          'content-disposition',
          `attachment; filename="operaciones-${request.query.desde}-${request.query.hasta}.csv"`,
        )
        .send(csv);
    },
  );
}
