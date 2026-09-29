import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITMO = 'aes-256-gcm';
const VERSION = 'v1';
const LONGITUD_CLAVE = 32;

/** Convierte la clave en base64 del `.env` en 32 bytes. Falla si no tiene exactamente ese tamaño. */
export function leerClave(base64: string): Buffer {
  const clave = Buffer.from(base64, 'base64');
  if (clave.length !== LONGITUD_CLAVE) {
    throw new Error(`La clave de cifrado debe tener ${String(LONGITUD_CLAVE)} bytes en base64.`);
  }
  return clave;
}

/** Cifra con AES-256-GCM. Resultado: `v1:iv:etiqueta:datos`, todo en base64url. */
export function cifrar(texto: string, clave: Buffer): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv(ALGORITMO, clave, iv);
  const datos = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  return [VERSION, iv, cifrador.getAuthTag(), datos]
    .map((parte) => (typeof parte === 'string' ? parte : parte.toString('base64url')))
    .join(':');
}

/** Descifra lo producido por `cifrar`. Lanza un error si el texto fue alterado o la clave no es la misma. */
export function descifrar(cifrado: string, clave: Buffer): string {
  const [version, iv, etiqueta, datos, ...sobrante] = cifrado.split(':');
  if (version !== VERSION || !iv || !etiqueta || !datos || sobrante.length > 0) {
    throw new Error('El texto cifrado no tiene un formato válido.');
  }
  try {
    const descifrador = createDecipheriv(ALGORITMO, clave, Buffer.from(iv, 'base64url'));
    descifrador.setAuthTag(Buffer.from(etiqueta, 'base64url'));
    return Buffer.concat([
      descifrador.update(Buffer.from(datos, 'base64url')),
      descifrador.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('No se pudo descifrar: el texto fue alterado o la clave no coincide.');
  }
}
