import { Writable } from 'node:stream';

import type { Rol } from '@cambios-jc/shared';
import type { FastifyInstance } from 'fastify';

import { construirApp } from '../src/app.js';
import { leerConfig, type Config } from '../src/lib/config.js';
import type { CuerpoError } from '../src/lib/errores.js';
import { crearPrisma, type PrismaClient } from '../src/lib/prisma.js';
import type { ResolverSesion, UsuarioAutenticado } from '../src/plugins/permisos.js';

/** Clave de cifrado 2FA solo para pruebas (32 bytes fijos): no depende del `.env` de nadie. */
export const CLAVE_CIFRADO_PRUEBAS = Buffer.alloc(32, 7).toString('base64');

/** Configuración para pruebas: base de pruebas (la fija Vitest en DATABASE_URL), sin logs. */
export function configPrueba(cambios: Partial<Config> = {}): Config {
  return {
    ...leerConfig({
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL,
      CLAVE_CIFRADO_2FA: CLAVE_CIFRADO_PRUEBAS,
      LOG_NIVEL: 'silent',
    }),
    ...cambios,
  };
}

/** Usuario falso por rol. Los ids no existen en la base: sirven para probar permisos, no la bitácora. */
const IDS_DE_PRUEBA: Record<Rol, string> = {
  administrador: '00000000-0000-7000-8000-000000000001',
  vendedor: '00000000-0000-7000-8000-000000000002',
  digitador: '00000000-0000-7000-8000-000000000003',
};

export function usuarioDePrueba(rol: Rol, id = IDS_DE_PRUEBA[rol]): UsuarioAutenticado {
  return { id, login: `${rol}-prueba`, nombre: `Usuario ${rol}`, rol, sesionId: `sesion-${rol}` };
}

/**
 * Resuelve la sesión a partir de la cabecera `x-rol-prueba` (sin ella, no hay sesión).
 * Con `x-sesion-parcial: si` la sesión es parcial (falta el 2FA).
 */
export const resolverPorCabecera: ResolverSesion = (request) => {
  const rol = request.headers['x-rol-prueba'];
  if (rol === 'administrador' || rol === 'vendedor' || rol === 'digitador') {
    return Promise.resolve({
      usuario: usuarioDePrueba(rol),
      completa: request.headers['x-sesion-parcial'] !== 'si',
    });
  }
  return Promise.resolve(null);
};

export interface OpcionesAppPrueba {
  config?: Partial<Config>;
  prisma?: PrismaClient;
  resolverSesion?: ResolverSesion;
  /** Usa la autenticación real (cookie + base de datos) en lugar de la cabecera de prueba. */
  sesionReal?: boolean;
  streamLogs?: NodeJS.WritableStream;
}

export function crearAppPrueba(opciones: OpcionesAppPrueba = {}): FastifyInstance {
  return construirApp({
    config: configPrueba(opciones.config),
    prisma: opciones.prisma ?? crearPrisma(),
    resolverSesion: opciones.sesionReal
      ? undefined
      : (opciones.resolverSesion ?? resolverPorCabecera),
    ...(opciones.streamLogs ? { streamLogs: opciones.streamLogs } : {}),
  });
}

/** Cierra la app aunque no haya llegado a arrancar. */
export async function cerrarApp(app: FastifyInstance | undefined): Promise<void> {
  await app?.close().catch(() => undefined);
}

/** Captura todo lo que la API escribe en sus logs. */
export function capturarLogs(): { stream: Writable; texto: () => string } {
  const partes: string[] = [];
  const stream = new Writable({
    write(trozo: Buffer, _codificacion, siguiente) {
      partes.push(trozo.toString());
      siguiente();
    },
  });
  return { stream, texto: () => partes.join('') };
}

export type CuerpoErrorApi = CuerpoError;
