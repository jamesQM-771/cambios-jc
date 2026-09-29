import { describe, expect, it } from 'vitest';

import { generarToken, hashToken } from './tokens.js';

describe('tokens de sesión', () => {
  it('el token tiene 256 bits en base64url y nunca se repite', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generarToken()));

    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('el hash es SHA-256 en hexadecimal, estable y distinto del token', () => {
    const token = generarToken();
    const hash = hashToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
    expect(hashToken(generarToken())).not.toBe(hash);
  });
});
