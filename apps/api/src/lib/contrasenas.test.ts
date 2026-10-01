import { describe, expect, it } from 'vitest';

import {
  esquemaContrasenaNueva,
  generarContrasenaTemporal,
  hashContrasena,
  verificarContraHashFalso,
  verificarContrasena,
} from './contrasenas.js';

describe('hash de contraseñas', () => {
  it('usa argon2id y no contiene la contraseña', async () => {
    const hash = await hashContrasena('una-clave-larga-1');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('una-clave-larga-1');
  });

  it('el mismo texto da hashes distintos (sal aleatoria) y ambos verifican', async () => {
    const a = await hashContrasena('una-clave-larga-1');
    const b = await hashContrasena('una-clave-larga-1');

    expect(a).not.toBe(b);
    expect(await verificarContrasena(a, 'una-clave-larga-1')).toBe(true);
    expect(await verificarContrasena(b, 'una-clave-larga-1')).toBe(true);
  });

  it('rechaza una contraseña distinta y un hash dañado sin lanzar error', async () => {
    const hash = await hashContrasena('una-clave-larga-1');

    expect(await verificarContrasena(hash, 'otra-clave-larga-2')).toBe(false);
    expect(await verificarContrasena('no-es-un-hash', 'una-clave-larga-1')).toBe(false);
  });

  it('el cálculo falso para usuarios inexistentes no falla', async () => {
    await expect(verificarContraHashFalso('lo-que-sea')).resolves.toBeUndefined();
  });
});

describe('política de contraseñas nuevas', () => {
  it('acepta de 10 a 128 caracteres', () => {
    expect(esquemaContrasenaNueva.safeParse('a'.repeat(10)).success).toBe(true);
    expect(esquemaContrasenaNueva.safeParse('a'.repeat(128)).success).toBe(true);
  });

  it('rechaza menos de 10 o más de 128, con mensaje en español', () => {
    const corta = esquemaContrasenaNueva.safeParse('a'.repeat(9));
    const larga = esquemaContrasenaNueva.safeParse('a'.repeat(129));

    expect(corta.success).toBe(false);
    expect(larga.success).toBe(false);
    expect(corta.error?.issues[0]?.message).toBe(
      'La contraseña debe tener al menos 10 caracteres.',
    );
  });
});

describe('contraseña temporal generada', () => {
  it('tiene 16 caracteres, sin letras que se confunden, y cumple la política', () => {
    for (let i = 0; i < 50; i++) {
      const contrasena = generarContrasenaTemporal();

      expect(contrasena).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{16}$/);
      expect(contrasena).not.toMatch(/[0oO1lI]/);
      expect(esquemaContrasenaNueva.safeParse(contrasena).success).toBe(true);
    }
  });

  it('nunca se repite', () => {
    const contrasenas = new Set(Array.from({ length: 500 }, () => generarContrasenaTemporal()));
    expect(contrasenas.size).toBe(500);
  });
});
