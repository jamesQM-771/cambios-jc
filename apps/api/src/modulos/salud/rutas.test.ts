import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { cerrarApp, crearAppPrueba } from '../../../test/ayudas.js';
import type { PrismaClient } from '../../lib/prisma.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await cerrarApp(app);
  app = undefined;
});

describe('GET /salud', () => {
  it('responde 200 sin sesión cuando la base de datos responde', async () => {
    app = crearAppPrueba();
    const respuesta = await app.inject({ method: 'GET', url: '/salud' });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toEqual({ estado: 'ok', api: 'ok', baseDatos: 'ok' });
  });

  it('responde 503 cuando la base de datos no responde, sin exponer el error', async () => {
    const baseCaida = {
      $queryRaw: () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:5432')),
      $disconnect: () => Promise.resolve(),
    } as unknown as PrismaClient;
    app = crearAppPrueba({ prisma: baseCaida });

    const respuesta = await app.inject({ method: 'GET', url: '/salud' });

    expect(respuesta.statusCode).toBe(503);
    expect(respuesta.json()).toEqual({ estado: 'degradado', api: 'ok', baseDatos: 'caida' });
    expect(respuesta.body).not.toMatch(/ECONNREFUSED|5432/);
  });
});
