import Fastify, { type FastifyInstance } from 'fastify';

import { crearAlmacenamiento } from './lib/almacenamiento.js';
import type { Config } from './lib/config.js';
import { opcionesLogger } from './lib/enmascarar-logs.js';
import type { PrismaClient } from './lib/prisma.js';
import { rutasAuditoria } from './modulos/auditoria/rutas.js';
import { crearServicioAuditoria } from './modulos/auditoria/servicio.js';
import { rutasAuth, NOMBRE_COOKIE_SESION } from './modulos/auth/rutas.js';
import { rutasBancos } from './modulos/bancos/rutas.js';
import { crearServicioBancos } from './modulos/bancos/servicio.js';
import { crearServicioAuth } from './modulos/auth/servicio.js';
import { rutasEmpresa } from './modulos/empresa/rutas.js';
import { crearServicioEmpresa } from './modulos/empresa/servicio.js';
import { rutasSalud } from './modulos/salud/rutas.js';
import { rutasUsuarios } from './modulos/usuarios/rutas.js';
import { crearServicioUsuarios } from './modulos/usuarios/servicio.js';
import { instalarAuditoria } from './plugins/auditoria.js';
import { instalarErrores } from './plugins/errores.js';
import { instalarPermisos, type ResolverSesion } from './plugins/permisos.js';
import { instalarSeguridad } from './plugins/seguridad.js';
import { instalarValidacionZod } from './plugins/validacion-zod.js';

export interface DependenciasApp {
  config: Config;
  prisma: PrismaClient;
  /** Identifica la sesión de la petición. Por defecto lee la cookie; las pruebas lo reemplazan. */
  resolverSesion?: ResolverSesion;
  /** Destino de los logs; solo lo usan las pruebas. */
  streamLogs?: NodeJS.WritableStream;
}

/**
 * Arma la aplicación sin escuchar en un puerto, para poder probarla con inject().
 * Las dependencias se inyectan; los módulos de negocio registran sus rutas aquí.
 */
export function construirApp({
  config,
  prisma,
  resolverSesion,
  streamLogs,
}: DependenciasApp): FastifyInstance {
  const app = Fastify({
    logger: { ...opcionesLogger(config.LOG_NIVEL), ...(streamLogs ? { stream: streamLogs } : {}) },
    trustProxy: config.CONFIAR_PROXY,
  });

  instalarErrores(app);
  instalarValidacionZod(app);
  instalarSeguridad(app, config);
  const servicioAuth = crearServicioAuth({ prisma, config });
  instalarPermisos(
    app,
    resolverSesion ??
      ((request) => servicioAuth.resolverSesion(request.cookies[NOMBRE_COOKIE_SESION])),
  );
  instalarAuditoria(app, prisma);

  // Las rutas de negocio se declaran dentro de un plugin: Fastify lo carga DESPUÉS de los plugins de
  // seguridad. El límite de peticiones se engancha con onRoute y solo alcanza a las rutas declaradas
  // una vez cargado; una ruta declarada aquí, fuera de un plugin, quedaría sin límite.
  app.register((rutas, _opciones, listo) => {
    rutasSalud(rutas, prisma);
    rutasAuth(rutas, { servicio: servicioAuth, prisma, config });
    rutasUsuarios(rutas, crearServicioUsuarios({ prisma, auth: servicioAuth }));
    rutasEmpresa(
      rutas,
      crearServicioEmpresa({
        prisma,
        almacenamiento: crearAlmacenamiento(config.CARPETA_SUBIDAS),
      }),
    );
    rutasAuditoria(rutas, crearServicioAuditoria({ prisma }));
    rutasBancos(rutas, crearServicioBancos({ prisma }));
    listo();
  });

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  return app;
}
