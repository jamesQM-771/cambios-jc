import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { cerrarApp, configPrueba, crearAppPrueba, type CuerpoErrorApi } from '../../test/ayudas.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await cerrarApp(app);
  app = undefined;
});

describe('cabeceras de seguridad (helmet)', () => {
  it('agrega las cabeceras de protección', async () => {
    app = crearAppPrueba();
    const respuesta = await app.inject({ method: 'GET', url: '/salud' });

    expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
    expect(respuesta.headers['strict-transport-security']).toBeDefined();
    expect(respuesta.headers['x-frame-options']).toBeDefined();
    expect(respuesta.headers['x-powered-by']).toBeUndefined();
  });
});

describe('CORS', () => {
  it('permite el origen de la web con cookies', async () => {
    const origen = configPrueba().ORIGEN_WEB;
    app = crearAppPrueba();
    const respuesta = await app.inject({
      method: 'GET',
      url: '/salud',
      headers: { origin: origen },
    });

    expect(respuesta.headers['access-control-allow-origin']).toBe(origen);
    expect(respuesta.headers['access-control-allow-credentials']).toBe('true');
  });

  it('a otro origen nunca le devuelve su propio origen como permitido', async () => {
    app = crearAppPrueba();
    const respuesta = await app.inject({
      method: 'GET',
      url: '/salud',
      headers: { origin: 'https://sitio-malicioso.example' },
    });

    expect(respuesta.headers['access-control-allow-origin']).not.toBe(
      'https://sitio-malicioso.example',
    );
    expect(respuesta.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('responde la petición previa (preflight) del origen permitido', async () => {
    const origen = configPrueba().ORIGEN_WEB;
    app = crearAppPrueba();
    const respuesta = await app.inject({
      method: 'OPTIONS',
      url: '/salud',
      headers: { origin: origen, 'access-control-request-method': 'POST' },
    });

    expect(respuesta.statusCode).toBe(204);
    expect(respuesta.headers['access-control-allow-methods']).toContain('POST');
  });
});

describe('límite de peticiones', () => {
  it('responde 429 con el formato de la API al superar el máximo', async () => {
    app = crearAppPrueba({ config: { RATE_LIMIT_MAX: 3 } });

    const estados: number[] = [];
    for (let i = 0; i < 4; i++) {
      estados.push((await app.inject({ method: 'GET', url: '/salud' })).statusCode);
    }
    const bloqueada = await app.inject({ method: 'GET', url: '/salud' });

    expect(estados).toEqual([200, 200, 200, 429]);
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.json<CuerpoErrorApi>().error.codigo).toBe('DEMASIADAS_PETICIONES');
  });
});
