import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { Config } from '../../lib/config.js';
import { errores } from '../../lib/errores.js';
import type { PrismaClient } from '../../lib/prisma.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import { aEmpresaPublica } from '../empresa/servicio.js';

import {
  esquemaCambioContrasena,
  esquemaCodigo,
  esquemaLogin,
  respuestaAcceso,
  respuestaConfigurar2fa,
  respuestaLogin,
  respuestaOk,
  respuestaPaso,
  respuestaYo,
} from './esquemas.js';
import type { ContextoPeticion, ServicioAuth, SesionEmitida } from './servicio.js';
import { permisosDeRol } from '../../lib/permisos.js';

export const NOMBRE_COOKIE_SESION = 'cambios_sesion';

// Las rutas de acceso son el blanco de los ataques de fuerza bruta: límite propio, más estricto que el general.
const LIMITE_ACCESO = { max: 10, timeWindow: '1 minute' } as const;

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

export function rutasAuth(
  app: FastifyInstance,
  { servicio, prisma, config }: { servicio: ServicioAuth; prisma: PrismaClient; config: Config },
): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  /** Cookie de sesión: httpOnly (el JavaScript de la página no la lee), sameSite=strict y secure en producción. */
  const poner = (respuesta: FastifyReply, sesion: SesionEmitida) =>
    respuesta.setCookie(NOMBRE_COOKIE_SESION, sesion.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.NODE_ENV === 'production',
      path: '/',
      expires: sesion.expiraEn,
    });

  const usuarioDe = (request: FastifyRequest) => {
    // Las rutas "parcial" y "autenticado" siempre llegan con usuario; esto lo hace explícito para TypeScript.
    if (!request.usuario) throw errores.noAutenticado();
    return request.usuario;
  };

  rutas.post(
    '/auth/login',
    {
      config: { acceso: 'publico', rateLimit: LIMITE_ACCESO },
      schema: { body: esquemaLogin, response: { 200: respuestaLogin } },
    },
    async (request, respuesta) => {
      const { login, contrasena } = request.body;
      const { sesion, siguientePaso, nombre } = await servicio.iniciarSesion(
        login,
        contrasena,
        contextoDe(request),
      );
      poner(respuesta, sesion);
      return { siguientePaso, nombre };
    },
  );

  rutas.post(
    '/auth/contrasena/cambiar',
    {
      config: { acceso: 'parcial', rateLimit: LIMITE_ACCESO },
      schema: { body: esquemaCambioContrasena, response: { 200: respuestaPaso } },
    },
    (request) =>
      servicio.cambiarContrasena(
        usuarioDe(request),
        request.body.contrasenaActual,
        request.body.contrasenaNueva,
        contextoDe(request),
      ),
  );

  rutas.post(
    '/auth/2fa/configurar',
    {
      config: { acceso: 'parcial', rateLimit: LIMITE_ACCESO },
      schema: { response: { 200: respuestaConfigurar2fa } },
    },
    (request) => servicio.configurar2fa(usuarioDe(request), contextoDe(request)),
  );

  rutas.post(
    '/auth/2fa/activar',
    {
      config: { acceso: 'parcial', rateLimit: LIMITE_ACCESO },
      schema: { body: esquemaCodigo, response: { 200: respuestaAcceso } },
    },
    async (request, respuesta) => {
      const { usuario, sesion } = await servicio.activar2fa(
        usuarioDe(request),
        request.body.codigo,
        contextoDe(request),
      );
      poner(respuesta, sesion);
      return { usuario };
    },
  );

  rutas.post(
    '/auth/2fa/verificar',
    {
      config: { acceso: 'parcial', rateLimit: LIMITE_ACCESO },
      schema: { body: esquemaCodigo, response: { 200: respuestaAcceso } },
    },
    async (request, respuesta) => {
      const { usuario, sesion } = await servicio.verificar2fa(
        usuarioDe(request),
        request.body.codigo,
        contextoDe(request),
      );
      poner(respuesta, sesion);
      return { usuario };
    },
  );

  // Pública e idempotente: cerrar una sesión que ya no existe no es un error.
  rutas.post(
    '/auth/logout',
    { config: { acceso: 'publico' }, schema: { response: { 200: respuestaOk } } },
    async (request, respuesta) => {
      await servicio.cerrarSesion(request.cookies[NOMBRE_COOKIE_SESION], contextoDe(request));
      void respuesta.clearCookie(NOMBRE_COOKIE_SESION, { path: '/' });
      return { ok: true as const };
    },
  );

  rutas.get(
    '/auth/yo',
    { config: { acceso: 'autenticado' }, schema: { response: { 200: respuestaYo } } },
    async (request) => {
      const usuario = usuarioDe(request);
      const empresa = await prisma.empresa.findUnique({ where: { unica: true } });
      return {
        usuario: { id: usuario.id, nombre: usuario.nombre, login: usuario.login, rol: usuario.rol },
        permisos: [...permisosDeRol(usuario.rol)],
        empresa: empresa ? aEmpresaPublica(empresa) : null,
      };
    },
  );
}
