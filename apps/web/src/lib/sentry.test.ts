import type { ErrorEvent } from '@sentry/react';
import { describe, expect, it } from 'vitest';

import { iniciarSentry, limpiarEvento } from './sentry.js';

describe('iniciarSentry', () => {
  it('sin DSN no se activa ni se descarga nada', () => {
    expect(iniciarSentry(undefined, 'test')).toBe(false);
    expect(iniciarSentry('', 'test')).toBe(false);
  });
});

describe('limpiarEvento', () => {
  it('quita usuario, parámetros de la dirección, migas de pan y extras', () => {
    const evento: ErrorEvent = {
      type: undefined,
      message: 'fallo',
      request: {
        url: 'https://app.ejemplo.com/usuarios?buscar=ana#parte',
        headers: { cookie: 'x=1' },
        cookies: { x: '1' },
      },
      user: { id: 'u1', username: 'ana', ip_address: '10.0.0.7' },
      breadcrumbs: [{ message: 'clic', data: { texto: 'secreta-123' } }],
      extra: { contrasena: 'secreta-123' },
    };

    const limpio = limpiarEvento(evento);

    expect(limpio.request).toEqual({ url: 'https://app.ejemplo.com/usuarios' });
    expect(limpio.user).toBeUndefined();
    expect(JSON.stringify(limpio)).not.toMatch(/secreta-123|10\.0\.0\.7|buscar=ana/);
  });

  it('un evento mínimo no falla', () => {
    expect(() => limpiarEvento({ type: undefined })).not.toThrow();
  });
});
