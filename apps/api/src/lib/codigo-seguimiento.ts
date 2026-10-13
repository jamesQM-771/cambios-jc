import { randomBytes } from 'node:crypto';

/**
 * Alfabeto de Crockford (sin I, L, O ni U): no se confunden al leerlo o dictarlo. Son 32 símbolos,
 * es decir 5 bits exactos por byte, así que tomar el byte módulo 32 no sesga la elección.
 */
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LONGITUD = 12;

/** Código de 12 símbolos (60 bits al azar): no se puede adivinar ni recorrer uno por uno. */
export function generarCodigoSeguimiento(): string {
  const bytes = randomBytes(LONGITUD);
  let codigo = '';
  for (const byte of bytes) codigo += ALFABETO.charAt(byte % ALFABETO.length);
  return codigo;
}

const PATRON = /^[0-9A-HJKMNP-TV-Z]{12}$/;

/** Normaliza lo que escribe una persona (minúsculas, espacios, guiones) y valida su forma. */
export function normalizarCodigoSeguimiento(texto: string): string | null {
  const limpio = texto.replace(/[\s-]/g, '').toUpperCase();
  return PATRON.test(limpio) ? limpio : null;
}
