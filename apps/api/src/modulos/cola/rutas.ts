import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import { detectarImagen } from '../../lib/imagen.js';
import { ErrorValidacion, type ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaCompletarTransferencia,
  esquemaId,
  esquemaIncidencia,
  respuestaCola,
  respuestaItemCola,
  respuestaResultadoCola,
} from './esquemas.js';
import type { ServicioCola } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const actorDe = (request: FastifyRequest): { id: string } => {
  if (!request.usuario) throw errores.noAutenticado();
  return { id: request.usuario.id };
};

const PERMISO = { permiso: 'remesa.tomar_completar' } as const;

export function rutasCola(app: FastifyInstance, servicio: ServicioCola): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/cola',
    { config: PERMISO, schema: { response: { 200: respuestaCola } } },
    async (request) => servicio.listar(actorDe(request).id),
  );

  rutas.post(
    '/cola/:id/tomar',
    { config: PERMISO, schema: { params: esquemaId, response: { 200: respuestaItemCola } } },
    async (request) => ({
      remesa: await servicio.tomar(request.params.id, actorDe(request), contextoDe(request)),
    }),
  );

  rutas.post(
    '/cola/:id/devolver',
    {
      config: PERMISO,
      schema: { params: esquemaId, response: { 200: respuestaResultadoCola } },
    },
    async (request) => ({
      remesa: await servicio.devolverACola(
        request.params.id,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/cola/:id/incidencia',
    {
      config: PERMISO,
      schema: {
        params: esquemaId,
        body: esquemaIncidencia,
        response: { 200: respuestaResultadoCola },
      },
    },
    async (request) => ({
      remesa: await servicio.reportarIncidencia(
        request.params.id,
        request.body.motivo,
        actorDe(request),
        contextoDe(request),
      ),
    }),
  );

  rutas.post(
    '/cola/:id/completar',
    {
      config: { ...PERMISO, rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { params: esquemaId, response: { 200: respuestaResultadoCola } },
    },
    async (request) => {
      if (!request.isMultipart()) {
        throw errores.archivoInvalido(
          'Envía los datos y la captura como un formulario con archivo (multipart/form-data).',
        );
      }
      // Se recorren todas las partes: un segundo archivo lo rechaza el plugin (FST_FILES_LIMIT) y
      // una captura de más de 1 MB responde 413 (el teléfono la comprime antes de enviarla).
      const campos: Record<string, string> = {};
      let contenido: Buffer | undefined;
      for await (const parte of request.parts()) {
        if (parte.type === 'file') contenido = await parte.toBuffer();
        else if (typeof parte.value === 'string') campos[parte.fieldname] = parte.value;
      }

      const analizado = esquemaCompletarTransferencia.safeParse(campos);
      if (!analizado.success) throw new ErrorValidacion(analizado.error);
      if (!contenido) throw errores.archivoInvalido('Falta la captura del comprobante.');

      // Se mira el contenido real: ni el nombre ni el tipo que declare el teléfono cuentan.
      const imagen = detectarImagen(contenido);
      if (!imagen) throw errores.archivoInvalido('La captura debe ser una imagen PNG o JPG.');

      return {
        remesa: await servicio.completar(
          request.params.id,
          analizado.data,
          { contenido, imagen },
          actorDe(request),
          contextoDe(request),
        ),
      };
    },
  );
}
