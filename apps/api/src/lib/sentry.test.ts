import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';
import { describe, expect, it } from 'vitest';

import { iniciarSentry, limpiarEvento, opcionesSentry } from './sentry.js';

describe('iniciarSentry', () => {
  it('sin DSN no se activa', () => {
    expect(iniciarSentry(undefined, 'test')).toBe(false);
    expect(iniciarSentry('', 'test')).toBe(false);
  });
});

describe('limpiarEvento', () => {
  const eventoSucio = (): ErrorEvent => ({
    type: undefined,
    message: 'Falló la cuenta 0102 0000 0000 0000 4441 del cliente',
    exception: { values: [{ type: 'Error', value: 'cuenta 01020000000000004441 inválida' }] },
    request: {
      method: 'POST',
      url: 'https://api.ejemplo.com/auth/login?codigo=123456',
      data: { contrasena: 'secreta-123' },
      cookies: { cambios_sesion: 'token-secreto' },
      headers: { cookie: 'cambios_sesion=token-secreto' },
      query_string: 'codigo=123456',
    },
    user: { id: 'u1', username: 'ana', ip_address: '10.0.0.7' },
    server_name: 'servidor-interno',
    breadcrumbs: [{ message: 'consulta 0102 0000 0000 0000 4441', data: { sql: 'select 1' } }],
  });

  it('quita cuerpo, cookies, cabeceras, consulta, usuario e IP', () => {
    const limpio = limpiarEvento(eventoSucio());

    expect(limpio.request).toEqual({
      method: 'POST',
      url: 'https://api.ejemplo.com/auth/login',
    });
    expect(limpio.user).toBeUndefined();
    expect(limpio.server_name).toBeUndefined();
    expect(JSON.stringify(limpio)).not.toMatch(/secreta-123|token-secreto|123456|10\.0\.0\.7/);
  });

  it('enmascara las cuentas bancarias de los mensajes y las migas de pan', () => {
    const limpio = limpiarEvento(eventoSucio());

    expect(JSON.stringify(limpio)).not.toContain('0000 0000 0000');
    expect(JSON.stringify(limpio)).not.toContain('01020000000000004441');
    expect(limpio.message).toContain('4441');
    expect(limpio.breadcrumbs?.[0]?.data).toBeUndefined();
  });

  it('un evento sin petición ni usuario no falla', () => {
    expect(() => limpiarEvento({ type: undefined, message: 'hola' })).not.toThrow();
  });
});

describe('envío real a Sentry (con transporte falso)', () => {
  it('lo que sale hacia Sentry no lleva cuentas, contraseñas ni la IP', async () => {
    const enviados: string[] = [];
    Sentry.init({
      ...opcionesSentry('https://llave@o1.ingest.sentry.io/2', 'test'),
      transport: () => ({
        send: (sobre) => {
          enviados.push(JSON.stringify(sobre));
          return Promise.resolve({});
        },
        flush: () => Promise.resolve(true),
      }),
    });

    Sentry.withScope((alcance) => {
      alcance.setUser({ id: 'u1', username: 'ana', ip_address: '10.0.0.7' });
      alcance.setExtra('contrasena', 'secreta-123');
      Sentry.captureException(new Error('Falló la cuenta 0102 0000 0000 0000 4441'));
    });
    await Sentry.flush(2000);
    await Sentry.close(2000);

    expect(enviados.length).toBeGreaterThan(0);
    const todo = enviados.join('');
    expect(todo).toContain('Falló la cuenta');
    expect(todo).not.toContain('0000 0000 0000');
    expect(todo).not.toContain('secreta-123');
    expect(todo).not.toMatch(/10\.0\.0\.7|"ana"/);
  });
});
