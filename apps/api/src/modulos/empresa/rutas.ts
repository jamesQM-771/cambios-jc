import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { detectarImagen } from '../../lib/imagen.js';
import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import { esquemaEditarEmpresa, respuestaEmpresa } from './esquemas.js';
import type { ServicioEmpresa } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const actorDe = (request: FastifyRequest): string => {
  // Las rutas con permiso siempre llegan con usuario; esto lo hace explícito para TypeScript.
  if (!request.usuario) throw errores.noAutenticado();
  return request.usuario.id;
};

const PERMISO = { permiso: 'empresa.configurar' } as const;

export function rutasEmpresa(app: FastifyInstance, servicio: ServicioEmpresa): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/empresa',
    { config: PERMISO, schema: { response: { 200: respuestaEmpresa } } },
    async () => ({ empresa: await servicio.obtener() }),
  );

  rutas.patch(
    '/empresa',
    {
      config: PERMISO,
      schema: { body: esquemaEditarEmpresa, response: { 200: respuestaEmpresa } },
    },
    async (request) => ({
      empresa: await servicio.editar(request.body, actorDe(request), contextoDe(request)),
    }),
  );

  rutas.post(
    '/empresa/logo',
    {
      config: { ...PERMISO, rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { response: { 200: respuestaEmpresa } },
    },
    async (request) => {
      if (!request.isMultipart()) {
        throw errores.archivoInvalido(
          'Envía el logo como un formulario con archivo (multipart/form-data).',
        );
      }
      // Se recorren todas las partes: si llega un segundo archivo, el plugin lanza FST_FILES_LIMIT (400).
      // Los campos de texto del formulario se ignoran. Si el archivo pasa de 1 MB, toBuffer() lanza
      // FST_REQ_FILE_TOO_LARGE y el plugin de errores responde 413.
      let contenido: Buffer | undefined;
      for await (const parte of request.parts()) {
        if (parte.type === 'file') contenido = await parte.toBuffer();
      }
      if (!contenido) throw errores.archivoInvalido('No se recibió ningún archivo.');

      // Se mira el contenido real: ni el nombre ni el tipo que declare el navegador cuentan.
      const imagen = detectarImagen(contenido);
      if (!imagen) throw errores.archivoInvalido('El logo debe ser una imagen PNG o JPG.');

      return {
        empresa: await servicio.cambiarLogo(
          contenido,
          imagen,
          actorDe(request),
          contextoDe(request),
        ),
      };
    },
  );

  // Pública: el logo se muestra en la pantalla de acceso, antes de iniciar sesión.
  rutas.get(
    '/empresa/logo',
    { config: { acceso: 'publico' }, schema: { response: { 200: z.unknown() } } },
    async (_request, respuesta) => {
      const logo = await servicio.abrirLogo();
      if (!logo) throw errores.noEncontrado('La empresa no tiene logo.');
      return (
        respuesta
          .header('content-type', logo.mime)
          .header('content-length', logo.tamano)
          .header('cache-control', 'public, max-age=300')
          // La web corre en otro puerto/origen: sin esto el navegador bloquearía la imagen (helmet usa same-origin).
          .header('cross-origin-resource-policy', 'cross-origin')
          .send(logo.flujo)
      );
    },
  );
}
