import { describe, expect, it } from 'vitest';

import { construirApp } from './app.js';

describe('construirApp', () => {
  it('responde 200 en GET /', async () => {
    const app = construirApp();
    const respuesta = await app.inject({ method: 'GET', url: '/' });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toEqual({ nombre: 'Cambios JC API' });
    await app.close();
  });
});
