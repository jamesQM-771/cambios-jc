import { esPermiso, tienePermiso, type Permiso, type Rol } from '@cambios-jc/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../lib/errores.js';

/** Usuario con sesión completa. La tarea 0.7 (autenticación) agrega aquí lo que haga falta. */
export interface UsuarioAutenticado {
  id: string;
  login: string;
  nombre: string;
  rol: Rol;
}

/** Devuelve el usuario de la petición, o `null` si no hay sesión válida. */
export type ResolverUsuario = (request: FastifyRequest) => Promise<UsuarioAutenticado | null>;

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Permiso que exige la ruta (CLAUDE.md §6). */
    permiso?: Permiso;
    /** Alternativa a `permiso`: ruta pública o solo para usuarios con sesión, sin permiso específico. */
    acceso?: 'publico' | 'autenticado';
  }

  interface FastifyRequest {
    usuario: UsuarioAutenticado | null;
  }
}

function tieneRespuestaDeclarada(esquema: unknown): boolean {
  if (typeof esquema !== 'object' || esquema === null || !('response' in esquema)) return false;
  const respuesta = esquema.response;
  return typeof respuesta === 'object' && respuesta !== null && Object.keys(respuesta).length > 0;
}

/**
 * Obliga a que cada ruta declare su permiso (o `acceso`) y su esquema de respuesta: si falta
 * alguno, la API no arranca. Después, en cada petición, comprueba sesión y permiso.
 */
export function instalarPermisos(app: FastifyInstance, resolverUsuario: ResolverUsuario): void {
  app.decorateRequest('usuario', null);

  app.addHook('onRoute', (ruta) => {
    const metodos = Array.isArray(ruta.method) ? ruta.method : [ruta.method];
    // Las respuestas de preflight de CORS (OPTIONS) las registra el plugin de CORS, no una ruta de negocio.
    if (metodos.every((metodo) => metodo === 'OPTIONS')) return;

    const identificador = `${metodos.join(',')} ${ruta.url}`;
    const { permiso, acceso } = ruta.config ?? {};

    if ((permiso === undefined) === (acceso === undefined)) {
      throw new Error(
        `La ruta ${identificador} debe declarar exactamente uno de config.permiso o config.acceso (CLAUDE.md §6).`,
      );
    }
    if (permiso !== undefined && !esPermiso(permiso)) {
      throw new Error(
        `La ruta ${identificador} declara un permiso que no existe: "${String(permiso)}".`,
      );
    }
    if (!tieneRespuestaDeclarada(ruta.schema)) {
      throw new Error(
        `La ruta ${identificador} debe declarar schema.response con Zod (CLAUDE.md §6).`,
      );
    }
  });

  app.addHook('onRequest', async (request) => {
    const { permiso, acceso } = request.routeOptions.config;
    // Sin declaración = ruta que no es de negocio (404, preflight de CORS): no requiere sesión.
    if (permiso === undefined && acceso === undefined) return;
    if (acceso === 'publico') return;

    const usuario = await resolverUsuario(request);
    request.usuario = usuario;
    if (!usuario) throw errores.noAutenticado();
    if (permiso !== undefined && !tienePermiso(usuario.rol, permiso)) throw errores.sinPermiso();
  });
}
