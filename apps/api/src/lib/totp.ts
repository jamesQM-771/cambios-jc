import { NOMBRE_SISTEMA } from '@cambios-jc/shared';
import { generateSecret, generateURI, verify } from 'otplib';

// Google Authenticator y similares: SHA-1, 6 dígitos, paso de 30 segundos (valores por defecto de otplib).
const TOLERANCIA_SEGUNDOS = 30;

export function generarSecretoTotp(): string {
  return generateSecret();
}

/** URL `otpauth://` que se convierte en el código QR que escanea la aplicación autenticadora. */
export function urlOtpauth(secreto: string, login: string): string {
  return generateURI({ issuer: NOMBRE_SISTEMA, label: login, secret: secreto });
}

export type ResultadoCodigo = { valido: true; paso: number } | { valido: false };

/**
 * Verifica un código de 6 dígitos. Acepta el paso anterior y el siguiente (relojes desfasados) y
 * rechaza cualquier paso igual o anterior a `ultimoPaso`: un mismo código no se puede usar dos veces.
 * `ahora` (milisegundos) solo se cambia en las pruebas.
 */
export async function verificarCodigo(
  secreto: string,
  codigo: string,
  ultimoPaso: number | null,
  ahora = Date.now(),
): Promise<ResultadoCodigo> {
  const resultado = await verify({
    secret: secreto,
    token: codigo,
    epoch: Math.floor(ahora / 1000),
    epochTolerance: TOLERANCIA_SEGUNDOS,
    ...(ultimoPaso === null ? {} : { afterTimeStep: ultimoPaso }),
  }).catch(() => null); // un código mal formado es simplemente un código incorrecto
  if (!resultado) return { valido: false };
  // El resultado de otplib es una unión con HOTP; solo el de TOTP trae el paso de tiempo.
  if (!resultado.valid || !('timeStep' in resultado)) return { valido: false };
  return { valido: true, paso: resultado.timeStep };
}
