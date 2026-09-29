import { randomUUID } from 'node:crypto';

import type { Rol } from '@cambios-jc/shared';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { generate } from 'otplib';

import { cifrar, leerClave } from '../src/lib/cifrado.js';
import { hashContrasena } from '../src/lib/contrasenas.js';
import type { CuerpoError } from '../src/lib/errores.js';
import type { PrismaClient } from '../src/lib/prisma.js';
import { generarSecretoTotp } from '../src/lib/totp.js';
import { NOMBRE_COOKIE_SESION } from '../src/modulos/auth/rutas.js';

import { CLAVE_CIFRADO_PRUEBAS } from './ayudas.js';

export interface UsuarioDePrueba {
  id: string;
  login: string;
  contrasena: string;
  /** Secreto TOTP en claro (solo si se creó con 2FA), para generar códigos válidos. */
  secreto: string | null;
}

export interface OpcionesUsuario {
  rol?: Rol;
  /** Contraseña temporal pendiente de cambio. Por defecto no. */
  debeCambiarContrasena?: boolean;
  /** Con 2FA ya activado. Por defecto no. */
  con2fa?: boolean;
  activo?: boolean;
}

/** Crea un usuario real en la base de pruebas, con login y contraseña únicos por prueba. */
export async function crearUsuarioDePrueba(
  prisma: PrismaClient,
  opciones: OpcionesUsuario = {},
): Promise<UsuarioDePrueba> {
  const login = `u-${randomUUID().slice(0, 8)}`;
  const contrasena = `clave-${randomUUID()}`;
  const secreto = opciones.con2fa ? generarSecretoTotp() : null;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: 'Usuario de prueba',
      login,
      hashContrasena: await hashContrasena(contrasena),
      debeCambiarContrasena: opciones.debeCambiarContrasena ?? false,
      rol: opciones.rol ?? 'administrador',
      activo: opciones.activo ?? true,
      tiene2fa: secreto !== null,
      secreto2fa: secreto ? cifrar(secreto, leerClave(CLAVE_CIFRADO_PRUEBAS)) : null,
    },
  });
  return { id: usuario.id, login, contrasena, secreto };
}

/** Código de 6 dígitos válido ahora (o `segundos` más tarde/temprano) para un secreto. */
export const codigoDe = (secreto: string, segundos = 0): Promise<string> =>
  generate({ secret: secreto, epoch: Math.floor(Date.now() / 1000) + segundos });

/** Un código de 6 dígitos que con seguridad es incorrecto para ese secreto. */
export async function codigoIncorrecto(secreto: string): Promise<string> {
  const bueno = await codigoDe(secreto);
  const cercanos = new Set([bueno, await codigoDe(secreto, -30), await codigoDe(secreto, 30)]);
  return ['000000', '111111', '222222'].find((codigo) => !cercanos.has(codigo)) ?? '999999';
}

/** Token de la cookie de sesión que puso (o borró) una respuesta. `undefined` si no la tocó. */
export function tokenDe(respuesta: LightMyRequestResponse): string | undefined {
  return respuesta.cookies.find((cookie) => cookie.name === NOMBRE_COOKIE_SESION)?.value;
}

export const conSesion = (token: string | undefined): Record<string, string> =>
  token ? { cookie: `${NOMBRE_COOKIE_SESION}=${token}` } : {};

export function cuerpoError(respuesta: LightMyRequestResponse): CuerpoError['error'] {
  return respuesta.json<CuerpoError>().error;
}

export async function iniciarSesion(
  app: FastifyInstance,
  login: string,
  contrasena: string,
): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'POST', url: '/auth/login', payload: { login, contrasena } });
}

export async function publicar(
  app: FastifyInstance,
  url: string,
  token: string | undefined,
  cuerpo?: unknown,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url,
    headers: conSesion(token),
    ...(cuerpo === undefined ? {} : { payload: cuerpo as object }),
  });
}

/** Deja la fila única de `empresa` creada (otras pruebas pueden haberla creado ya). */
export async function asegurarEmpresa(prisma: PrismaClient): Promise<void> {
  if (!(await prisma.empresa.findUnique({ where: { unica: true } }))) {
    await prisma.empresa.create({ data: { nombre: 'Empresa de prueba' } });
  }
}

/** JSON.stringify que acepta BigInt (los ids de la bitácora), para buscar texto en filas de la base. */
export const aTexto = (valor: unknown): string =>
  JSON.stringify(valor, (_clave, contenido: unknown) =>
    typeof contenido === 'bigint' ? contenido.toString() : contenido,
  );
