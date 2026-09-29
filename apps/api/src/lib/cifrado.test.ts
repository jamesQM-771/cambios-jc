import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { cifrar, descifrar, leerClave } from './cifrado.js';

const clave = randomBytes(32);

describe('cifrado AES-256-GCM', () => {
  it('descifrar devuelve el texto original', () => {
    const secreto = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    expect(descifrar(cifrar(secreto, clave), clave)).toBe(secreto);
  });

  it('el texto cifrado no contiene el original y cambia en cada cifrado', () => {
    const secreto = 'SECRETO-EN-CLARO';
    const a = cifrar(secreto, clave);
    const b = cifrar(secreto, clave);

    expect(a).not.toContain(secreto);
    expect(a).toMatch(/^v1:/);
    expect(a).not.toBe(b);
  });

  it('detecta un texto alterado', () => {
    const partes = cifrar('secreto', clave).split(':');
    partes[3] = Buffer.from('alterado').toString('base64url');

    expect(() => descifrar(partes.join(':'), clave)).toThrow(/alterado|clave/);
  });

  it('no descifra con otra clave', () => {
    expect(() => descifrar(cifrar('secreto', clave), randomBytes(32))).toThrow(/clave/);
  });

  it.each([['texto-sin-formato'], ['v2:a:b:c'], ['v1:a:b'], ['v1:a:b:c:d'], ['']])(
    'rechaza el formato "%s"',
    (texto) => {
      expect(() => descifrar(texto, clave)).toThrow();
    },
  );

  it('leerClave exige exactamente 32 bytes en base64', () => {
    expect(leerClave(randomBytes(32).toString('base64'))).toHaveLength(32);
    expect(() => leerClave(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
    expect(() => leerClave('')).toThrow(/32 bytes/);
  });
});
