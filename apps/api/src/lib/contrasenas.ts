import { randomInt } from 'node:crypto';

import argon2 from 'argon2';
import { z } from 'zod';

export const LONGITUD_MINIMA_CONTRASENA = 10;
export const LONGITUD_MAXIMA_CONTRASENA = 128;

/** Política de contraseñas nuevas (FASE-0 §0.7): mínimo 10 caracteres. */
export const esquemaContrasenaNueva = z
  .string()
  .min(
    LONGITUD_MINIMA_CONTRASENA,
    `La contraseña debe tener al menos ${String(LONGITUD_MINIMA_CONTRASENA)} caracteres.`,
  )
  .max(
    LONGITUD_MAXIMA_CONTRASENA,
    `La contraseña no puede pasar de ${String(LONGITUD_MAXIMA_CONTRASENA)} caracteres.`,
  );

export function hashContrasena(contrasena: string): Promise<string> {
  return argon2.hash(contrasena, { type: argon2.argon2id });
}

export async function verificarContrasena(hash: string, contrasena: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, contrasena);
  } catch {
    return false;
  }
}

let hashFalso: Promise<string> | undefined;

/**
 * Hace el mismo trabajo que una verificación real. Se llama cuando el usuario no existe o está
 * desactivado, para que la respuesta tarde lo mismo y no revele qué usuarios existen.
 */
export async function verificarContraHashFalso(contrasena: string): Promise<void> {
  hashFalso ??= hashContrasena('contrasena-falsa-para-igualar-tiempos');
  await verificarContrasena(await hashFalso, contrasena);
}

// Sin caracteres que se confunden al leerlos o dictarlos: 0/O, 1/l/I.
const ALFABETO_TEMPORAL = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LONGITUD_TEMPORAL = 16;

/** Contraseña temporal aleatoria (criptográficamente segura) para usuarios nuevos y restablecimientos. */
export function generarContrasenaTemporal(): string {
  return Array.from({ length: LONGITUD_TEMPORAL }, () =>
    ALFABETO_TEMPORAL.charAt(randomInt(ALFABETO_TEMPORAL.length)),
  ).join('');
}
