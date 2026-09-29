import Fastify, { type FastifyInstance } from 'fastify';

import type { Config } from './lib/config.js';
import { opcionesLogger } from './lib/enmascarar-logs.js';
import type { PrismaClient } from './lib/prisma.js';
import { rutasSalud } from './modulos/salud/rutas.js';
import { instalarAuditoria } from './plugins/auditoria.js';
import { instalarErrores } from './plugins/errores.js';
import { instalarPermisos, type ResolverUsuario } from './plugins/permisos.js';
import { instalarSeguridad } from './plugins/seguridad.js';
import { instalarValidacionZod } from './plugins/validacion-zod.js';

export interface DependenciasApp {
  config: Config;
  prisma: PrismaClient;
  /** Identifica al usuario de la petición. La autenticación real llega en la tarea 0.7. */
  resolverUsuario?: ResolverUsuario;
  /** Destino de los logs; solo lo usan las pruebas. */
  streamLogs?: NodeJS.WritableStream;
}

// Hasta la tarea 0.7 nadie tiene sesión: toda ruta protegida responde 401.
const sinSesion: ResolverUsuario = () => Promise.resolve(null);

/**
 * Arma la aplicación sin escuchar en un puerto, para poder probarla con inject().
 * Las dependencias se inyectan; los módulos de negocio registran sus rutas aquí.
 */
export function construirApp({
  config,
  prisma,
  resolverUsuario = sinSesion,
  streamLogs,
}: DependenciasApp): FastifyInstance {
  const app = Fastify({
    logger: { ...opcionesLogger(config.LOG_NIVEL), ...(streamLogs ? { stream: streamLogs } : {}) },
    trustProxy: config.CONFIAR_PROXY,
  });

  instalarErrores(app);
  instalarValidacionZod(app);
  instalarSeguridad(app, config);
  instalarPermisos(app, resolverUsuario);
  instalarAuditoria(app, prisma);

  // Las rutas de negocio se declaran dentro de un plugin: Fastify lo carga DESPUÉS de los plugins de
  // seguridad. El límite de peticiones se engancha con onRoute y solo alcanza a las rutas declaradas
  // una vez cargado; una ruta declarada aquí, fuera de un plugin, quedaría sin límite.
  app.register((rutas, _opciones, listo) => {
    rutasSalud(rutas, prisma);
    listo();
  });

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  return app;
}
