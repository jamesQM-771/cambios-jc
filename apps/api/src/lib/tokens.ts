import { createHash, randomBytes } from 'node:crypto';

/** Token de sesión: 256 bits aleatorios en base64url. Es lo único que viaja en la cookie. */
export function generarToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 en hexadecimal. En la base de datos solo se guarda este hash, nunca el token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
