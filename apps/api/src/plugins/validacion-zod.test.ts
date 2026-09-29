import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { cerrarApp, crearAppPrueba, type CuerpoErrorApi } from '../../test/ayudas.js';

import type { ProveedorZod } from './validacion-zod.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await cerrarApp(app);
  app = undefined;
});

// Lo que un servicio devolvería por error: incluye pesos, tasa y datos del remitente.
const filaInterna = {
  bolivares: '43085.106',
  pesos: '162000.00',
  tasa: '3.76',
  remitente: { documento: 'CC 1000000001', nombre: 'Cliente Prueba Uno' },
};

function appConRutas(): FastifyInstance {
  const nueva = crearAppPrueba();
  const rutas = nueva.withTypeProvider<ProveedorZod>();

  // Vista del digitador: el esquema solo declara lo que puede ver.
  rutas.get(
    '/prueba/digitador',
    {
      config: { acceso: 'publico' },
      schema: { response: { 200: z.object({ bolivares: z.string() }) } },
    },
    () => filaInterna,
  );
  rutas.get(
    '/prueba/respuesta-rota',
    {
      config: { acceso: 'publico' },
      schema: { response: { 200: z.object({ bolivares: z.string() }) } },
    },
    () => ({ bolivares: 43085.106 }) as never,
  );
  rutas.get(
    '/prueba/consulta',
    {
      config: { acceso: 'publico' },
      schema: {
        querystring: z.object({ pagina: z.coerce.number().int().min(1) }),
        response: { 200: z.object({ pagina: z.number() }) },
      },
    },
    (peticion) => ({ pagina: peticion.query.pagina }),
  );
  return nueva;
}

describe('validación y serialización con Zod', () => {
  it('elimina de la respuesta los campos que el esquema no declara (pesos, tasa, remitente)', async () => {
    app = appConRutas();
    const respuesta = await app.inject({ method: 'GET', url: '/prueba/digitador' });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toEqual({ bolivares: '43085.106' });
    expect(respuesta.body).not.toMatch(/162000|3\.76|remitente|Cliente Prueba/);
  });

  it('una respuesta que no cumple el esquema es un error 500, no se envía tal cual', async () => {
    app = appConRutas();
    const respuesta = await app.inject({ method: 'GET', url: '/prueba/respuesta-rota' });

    expect(respuesta.statusCode).toBe(500);
    expect(respuesta.json<CuerpoErrorApi>().error.codigo).toBe('ERROR_INTERNO');
  });

  it('valida y convierte la query', async () => {
    app = appConRutas();
    const buena = await app.inject({ method: 'GET', url: '/prueba/consulta?pagina=3' });
    const mala = await app.inject({ method: 'GET', url: '/prueba/consulta?pagina=abc' });

    expect(buena.json()).toEqual({ pagina: 3 });
    expect(mala.statusCode).toBe(400);
    expect(mala.json<CuerpoErrorApi>().error.codigo).toBe('VALIDACION_FALLIDA');
  });
});
