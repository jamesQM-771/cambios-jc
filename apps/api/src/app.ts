import Fastify, { type FastifyInstance } from 'fastify';

import { crearAlmacenamiento } from './lib/almacenamiento.js';
import { crearTiempoReal } from './lib/tiempo-real.js';
import type { Config } from './lib/config.js';
import { opcionesLogger } from './lib/enmascarar-logs.js';
import type { PrismaClient } from './lib/prisma.js';
import { rutasAuditoria } from './modulos/auditoria/rutas.js';
import { crearServicioAuditoria } from './modulos/auditoria/servicio.js';
import { rutasAuth, NOMBRE_COOKIE_SESION } from './modulos/auth/rutas.js';
import { rutasBancos } from './modulos/bancos/rutas.js';
import { crearServicioBancos } from './modulos/bancos/servicio.js';
import { rutasCajas } from './modulos/cajas/rutas.js';
import { crearServicioCajas } from './modulos/cajas/servicio.js';
import { rutasClientes } from './modulos/clientes/rutas.js';
import { crearServicioClientes } from './modulos/clientes/servicio.js';
import { rutasCuentasDinero } from './modulos/cuentas-dinero/rutas.js';
import { crearServicioCuentasDinero } from './modulos/cuentas-dinero/servicio.js';
import { rutasDenominaciones } from './modulos/denominaciones/rutas.js';
import { crearServicioDenominaciones } from './modulos/denominaciones/servicio.js';
import { rutasLineasNegocio } from './modulos/lineas-negocio/rutas.js';
import { crearServicioLineasNegocio } from './modulos/lineas-negocio/servicio.js';
import { rutasCola } from './modulos/cola/rutas.js';
import { crearServicioCola } from './modulos/cola/servicio.js';
import { rutasSeguimiento } from './modulos/seguimiento/rutas.js';
import { crearServicioSeguimiento } from './modulos/seguimiento/servicio.js';
import { rutasRecibos } from './modulos/recibos/rutas.js';
import { crearServicioRecibos } from './modulos/recibos/servicio.js';
import { rutasRemesas } from './modulos/remesas/rutas.js';
import { crearServicioRemesas } from './modulos/remesas/servicio.js';
import { rutasLibro } from './modulos/libro/rutas.js';
import { rutasCategoriasGasto } from './modulos/categorias-gasto/rutas.js';
import { crearServicioCategoriasGasto } from './modulos/categorias-gasto/servicio.js';
import { rutasGastos } from './modulos/gastos/rutas.js';
import { rutasJornadas } from './modulos/jornadas/rutas.js';
import { crearServicioJornadas } from './modulos/jornadas/servicio.js';
import { crearServicioGastos } from './modulos/gastos/servicio.js';
import { rutasContrapartes } from './modulos/contrapartes/rutas.js';
import { crearServicioContrapartes } from './modulos/contrapartes/servicio.js';
import { rutasCompras } from './modulos/compras/rutas.js';
import { crearServicioCompras } from './modulos/compras/servicio.js';
import { rutasInventario } from './modulos/inventario/rutas.js';
import { crearServicioInventario } from './modulos/inventario/servicio.js';
import { rutasTraslados } from './modulos/traslados/rutas.js';
import { crearServicioTraslados } from './modulos/traslados/servicio.js';
import { crearServicioLibro } from './modulos/libro/servicio.js';
import { rutasTurnos } from './modulos/turnos/rutas.js';
import { crearServicioTurnos } from './modulos/turnos/servicio.js';
import { rutasTasas } from './modulos/tasas/rutas.js';
import { crearServicioTasas } from './modulos/tasas/servicio.js';
import { crearServicioAuth } from './modulos/auth/servicio.js';
import { rutasEmpresa } from './modulos/empresa/rutas.js';
import { crearServicioEmpresa } from './modulos/empresa/servicio.js';
import { rutasSalud } from './modulos/salud/rutas.js';
import { rutasSucursales } from './modulos/sucursales/rutas.js';
import { crearServicioSucursales } from './modulos/sucursales/servicio.js';
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

  // Tiempo real (D109): avisos de cambios de remesas por Socket.IO, con la misma cookie de sesión.
  const tiempoReal = crearTiempoReal({
    servidor: app.server,
    origenWeb: config.ORIGEN_WEB,
    nombreCookieSesion: NOMBRE_COOKIE_SESION,
    resolverSesion: (token) => servicioAuth.resolverSesion(token),
  });

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
    rutasSucursales(rutas, crearServicioSucursales({ prisma }));
    rutasCajas(rutas, crearServicioCajas({ prisma }));
    rutasDenominaciones(rutas, crearServicioDenominaciones({ prisma }));
    rutasLineasNegocio(rutas, crearServicioLineasNegocio({ prisma }));
    const almacenamiento = crearAlmacenamiento(config.CARPETA_SUBIDAS);
    const { notificador } = tiempoReal;
    rutasRemesas(rutas, crearServicioRemesas({ prisma, almacenamiento, notificador }));
    rutasCola(rutas, crearServicioCola({ prisma, almacenamiento, notificador }));
    rutasRecibos(rutas, crearServicioRecibos({ prisma, origenWeb: config.ORIGEN_WEB }));
    rutasSeguimiento(rutas, crearServicioSeguimiento({ prisma }));
    rutasTasas(rutas, crearServicioTasas({ prisma }));
    rutasClientes(rutas, crearServicioClientes({ prisma }));
    rutasTurnos(rutas, crearServicioTurnos({ prisma }));
    rutasLibro(rutas, crearServicioLibro({ prisma }));
    rutasTraslados(rutas, crearServicioTraslados({ prisma }));
    rutasCategoriasGasto(rutas, crearServicioCategoriasGasto({ prisma }));
    rutasGastos(rutas, crearServicioGastos({ prisma }));
    rutasJornadas(rutas, crearServicioJornadas({ prisma }));
    rutasCuentasDinero(rutas, crearServicioCuentasDinero({ prisma }));
    rutasContrapartes(rutas, crearServicioContrapartes({ prisma }));
    rutasCompras(rutas, crearServicioCompras({ prisma }));
    rutasInventario(rutas, crearServicioInventario({ prisma }));
    listo();
  });

  app.addHook('onClose', async () => {
    await tiempoReal.cerrar();
    await prisma.$disconnect();
  });

  return app;
}
