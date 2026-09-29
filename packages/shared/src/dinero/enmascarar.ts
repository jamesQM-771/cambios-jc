import { ErrorDinero } from './errores.js';

/**
 * Enmascara una cuenta bancaria venezolana de 20 dígitos para logs y pantallas que no
 * necesitan el número completo: "01020241810000164441" → "0102 **** **** **** 4441".
 * Acepta la cuenta con o sin espacios.
 */
export function enmascararCuenta(cuenta: string): string {
  const digitos = cuenta.replace(/\s/g, '');
  if (!/^\d{20}$/.test(digitos)) {
    throw new ErrorDinero('CUENTA_INVALIDA', 'La cuenta debe tener exactamente 20 dígitos.');
  }
  return `${digitos.slice(0, 4)} **** **** **** ${digitos.slice(-4)}`;
}
