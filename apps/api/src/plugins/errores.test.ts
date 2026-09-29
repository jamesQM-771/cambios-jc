import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { cerrarApp, crearAppPrueba, type CuerpoErrorApi } from '../../test/ayudas.js';
import { errores } from '../lib/errores.js';

import type { ProveedorZod } from './validacion-zod.js';

const respuestaOk = { 200: z.object({ ok: z.boolean() }) };

let app: FastifyInstance | undefined;

afterEach(async () => {
  await cerrarApp(app);
  app = undefined;
});

function appConRutas(): FastifyInstance {
  const nueva = crearAppPrueba();
  const rutas = nueva.withTypeProvider<ProveedorZod>();
  rutas.post(
    '/prueba/monto',
    {
      config: { acceso: 'publico' },
      schema: {
        body: z.object({ monto: z.string(), moneda: z.enum(['COP', 'VES']) }),
        response: respuestaOk,
      },
    },
    () => ({ ok: true }),
  );
  rutas.get(
    '/prueba/falla',
    { config: { acceso: 'publico' }, schema: { response: respuestaOk } },
    () => {
      throw new Error('SELECT * FROM usuario WHERE hash_contrasena = $1 falló en la fila 42');
    },
  );
  rutas.get(
    '/prueba/no-existe',
    { config: { acceso: 'publico' }, schema: { response: respuestaOk } },
    () => {
      throw errores.noEncontrado('El usuario no existe.');
    },
  );
  return nueva;
}

describe('formato uniforme de errores', () => {
  it('una ruta inexistente responde 404 con el formato de la API', async () => {
    app = appConRutas();
    const respuesta = await app.inject({ method: 'GET', url: '/' });

    expect(respuesta.statusCode).toBe(404);
    expect(respuesta.json<CuerpoErrorApi>()).toEqual({
      error: { codigo: 'NO_ENCONTRADO', mensaje: 'La ruta solicitada no existe.' },
    });
  });

  it('datos inválidos responden 400 con el detalle de cada campo', async () => {
    app = appConRutas();
    const respuesta = await app.inject({
      method: 'POST',
      url: '/prueba/monto',
      payload: { monto: 162000, moneda: 'EUR' },
    });

    expect(respuesta.statusCode).toBe(400);
    const { error } = respuesta.json<CuerpoErrorApi>();
    expect(error.codigo).toBe('VALIDACION_FALLIDA');
    const campos = (error.detalles as { campo: string; mensaje: string }[]).map((d) => d.campo);
    expect(campos).toEqual(expect.arrayContaining(['monto', 'moneda']));
  });

  it('los mensajes de validación están en español', async () => {
    app = appConRutas();
    const respuesta = await app.inject({ method: 'POST', url: '/prueba/monto', payload: {} });

    const detalles = respuesta.json<CuerpoErrorApi>().error.detalles as { mensaje: string }[];
    expect(detalles.length).toBeGreaterThan(0);
    for (const { mensaje } of detalles)
      expect(mensaje).not.toMatch(/invalid|expected|received|required/i);
  });

  it('un JSON mal formado responde 400 sin exponer el detalle del analizador', async () => {
    app = appConRutas();
    const respuesta = await app.inject({
      method: 'POST',
      url: '/prueba/monto',
      headers: { 'content-type': 'application/json' },
      payload: '{"monto": ',
    });

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.json<CuerpoErrorApi>().error.codigo).toBe('SOLICITUD_INVALIDA');
    expect(respuesta.body).not.toMatch(/JSON|position|token/i);
  });

  it('un error interno responde 500 sin trazas ni SQL', async () => {
    app = appConRutas();
    const respuesta = await app.inject({ method: 'GET', url: '/prueba/falla' });

    expect(respuesta.statusCode).toBe(500);
    expect(respuesta.json<CuerpoErrorApi>().error.codigo).toBe('ERROR_INTERNO');
    expect(respuesta.body).not.toMatch(/SELECT|hash_contrasena|fila 42|\bat \w+/);
  });

  it('un ErrorApp lanzado por un servicio conserva su código, estado y mensaje', async () => {
    app = appConRutas();
    const respuesta = await app.inject({ method: 'GET', url: '/prueba/no-existe' });

    expect(respuesta.statusCode).toBe(404);
    expect(respuesta.json<CuerpoErrorApi>()).toEqual({
      error: { codigo: 'NO_ENCONTRADO', mensaje: 'El usuario no existe.' },
    });
  });
});
