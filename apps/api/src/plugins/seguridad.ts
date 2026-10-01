import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

import type { Config } from '../lib/config.js';
import { MAXIMO_SUBIDA_BYTES } from '../lib/almacenamiento.js';
import { errores } from '../lib/errores.js';

/** Cabeceras de seguridad, CORS restringido al origen de la web y límite de peticiones por IP. */
export function instalarSeguridad(app: FastifyInstance, config: Config): void {
  void app.register(helmet);

  // Lee las cookies de la petición (la sesión viaja en una cookie httpOnly).
  void app.register(cookie);

  // Subida de archivos (el logo): un solo archivo de hasta 1 MB y pocos campos.
  void app.register(multipart, {
    limits: { fileSize: MAXIMO_SUBIDA_BYTES, files: 1, fields: 5, parts: 6 },
  });

  void app.register(cors, {
    origin: config.ORIGEN_WEB,
    // La sesión viaja en una cookie httpOnly: el navegador debe poder enviarla.
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  void app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_VENTANA_SEGUNDOS * 1000,
    // Cada ruta sensible puede fijar un límite propio con `config: { rateLimit: { max, timeWindow } }`.
    errorResponseBuilder: () => errores.demasiadasPeticiones(),
  });
}
