import { generate } from 'otplib';
import { describe, expect, it } from 'vitest';

import { generarSecretoTotp, urlOtpauth, verificarCodigo } from './totp.js';

const secreto = generarSecretoTotp();
const ahora = Date.now();
const codigoEn = (milisegundos: number) =>
  generate({ secret: secreto, epoch: Math.floor(milisegundos / 1000) });

describe('secreto y URL para el QR', () => {
  it('el secreto es base32 y nunca se repite', () => {
    const otro = generarSecretoTotp();

    expect(secreto).toMatch(/^[A-Z2-7]{32}$/);
    expect(otro).not.toBe(secreto);
  });

  it('la URL otpauth lleva el emisor, el usuario y el secreto', () => {
    const url = urlOtpauth(secreto, 'admin');

    expect(url.startsWith('otpauth://totp/')).toBe(true);
    expect(url).toContain('issuer=Cambios%20JC');
    expect(url).toContain('admin');
    expect(url).toContain(`secret=${secreto}`);
  });
});

describe('verificarCodigo', () => {
  it('acepta el código actual y devuelve su paso de tiempo', async () => {
    const resultado = await verificarCodigo(secreto, await codigoEn(ahora), null, ahora);

    expect(resultado).toEqual({ valido: true, paso: Math.floor(ahora / 1000 / 30) });
  });

  it('rechaza un código equivocado', async () => {
    const correcto = await codigoEn(ahora);
    const equivocado = correcto === '000000' ? '000001' : '000000';

    expect(await verificarCodigo(secreto, equivocado, null, ahora)).toEqual({ valido: false });
  });

  it('tolera un paso de diferencia (relojes desfasados) pero no más', async () => {
    expect(
      (await verificarCodigo(secreto, await codigoEn(ahora - 30_000), null, ahora)).valido,
    ).toBe(true);
    expect(
      (await verificarCodigo(secreto, await codigoEn(ahora + 30_000), null, ahora)).valido,
    ).toBe(true);
    expect(
      (await verificarCodigo(secreto, await codigoEn(ahora - 120_000), null, ahora)).valido,
    ).toBe(false);
  });

  it('rechaza reutilizar el mismo código o uno anterior al último usado', async () => {
    const codigo = await codigoEn(ahora);
    const primero = await verificarCodigo(secreto, codigo, null, ahora);
    if (!primero.valido) throw new Error('el primer intento debía ser válido');

    expect(await verificarCodigo(secreto, codigo, primero.paso, ahora)).toEqual({ valido: false });
    expect((await verificarCodigo(secreto, codigo, primero.paso - 1, ahora)).valido).toBe(true);
    expect(
      (await verificarCodigo(secreto, await codigoEn(ahora + 30_000), primero.paso, ahora)).valido,
    ).toBe(true);
  });

  it.each([[''], ['12345'], ['1234567'], ['abcdef']])('rechaza el código "%s"', async (codigo) => {
    expect((await verificarCodigo(secreto, codigo, null, ahora)).valido).toBe(false);
  });
});
