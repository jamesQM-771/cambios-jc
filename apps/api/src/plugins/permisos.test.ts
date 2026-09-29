import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { cerrarApp, crearAppPrueba, type CuerpoErrorApi } from '../../test/ayudas.js';

import type { ProveedorZod } from './validacion-zod.js';

const respuestaOk = { 200: z.object({ ok: z.boolean() }) };

let app: FastifyInstance | undefined;

afterEach(async () => {
  await cerrarApp(app);
  app = undefined;
});

/** App con tres rutas: solo administrador, cualquier sesión y pública. */
function appConRutas(): FastifyInstance {
  const nueva = crearAppPrueba();
  const rutas = nueva.withTypeProvider<ProveedorZod>();
  rutas.get(
    '/prueba/admin',
    { config: { permiso: 'usuario.gestionar' }, schema: { response: respuestaOk } },
    () => ({ ok: true }),
  );
  rutas.get(
    '/prueba/sesion',
    { config: { acceso: 'autenticado' }, schema: { response: respuestaOk } },
    () => ({ ok: true }),
  );
  rutas.get(
    '/prueba/abierta',
    { config: { acceso: 'publico' }, schema: { response: respuestaOk } },
    () => ({ ok: true }),
  );
  rutas.post(
    '/prueba/con-cuerpo',
    {
      config: { permiso: 'usuario.gestionar' },
      schema: { body: z.object({ nombre: z.string() }), response: respuestaOk },
    },
    () => ({ ok: true }),
  );
  return nueva;
}

describe('acceso a las rutas', () => {
  it('sin sesión responde 401 en una ruta con permiso', async () => {
    app = appConRutas();
    const respuesta = await app.inject({ method: 'GET', url: '/prueba/admin' });

    expect(respuesta.statusCode).toBe(401);
    expect(respuesta.json<CuerpoErrorApi>().error.codigo).toBe('NO_AUTENTICADO');
  });

  it('un vendedor sin el permiso recibe 403', async () => {
    app = appConRutas();
    const respuesta = await app.inject({
      method: 'GET',
      url: '/prueba/admin',
      headers: { 'x-rol-prueba': 'vendedor' },
    });

    expect(respuesta.statusCode).toBe(403);
    expect(respuesta.json<CuerpoErrorApi>().error.codigo).toBe('SIN_PERMISO');
  });

  it('un digitador tampoco pasa a una ruta de administrador', async () => {
    app = appConRutas();
    const respuesta = await app.inject({
      method: 'GET',
      url: '/prueba/admin',
      headers: { 'x-rol-prueba': 'digitador' },
    });
    expect(respuesta.statusCode).toBe(403);
  });

  it('el administrador con el permiso recibe 200', async () => {
    app = appConRutas();
    const respuesta = await app.inject({
      method: 'GET',
      url: '/prueba/admin',
      headers: { 'x-rol-prueba': 'administrador' },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toEqual({ ok: true });
  });

  it('una ruta "autenticado" acepta a cualquier rol con sesión y rechaza sin sesión', async () => {
    app = appConRutas();
    const conSesion = await app.inject({
      method: 'GET',
      url: '/prueba/sesion',
      headers: { 'x-rol-prueba': 'digitador' },
    });
    const sinSesion = await app.inject({ method: 'GET', url: '/prueba/sesion' });

    expect(conSesion.statusCode).toBe(200);
    expect(sinSesion.statusCode).toBe(401);
  });

  it('una ruta pública responde sin sesión', async () => {
    app = appConRutas();
    const respuesta = await app.inject({ method: 'GET', url: '/prueba/abierta' });
    expect(respuesta.statusCode).toBe(200);
  });

  it('la sesión y el permiso se comprueban antes de validar el cuerpo', async () => {
    app = appConRutas();
    const respuesta = await app.inject({
      method: 'POST',
      url: '/prueba/con-cuerpo',
      payload: { nombre: 123 },
    });
    // Sin sesión debe ser 401, no 400: no se revela cómo se valida a quien no tiene acceso.
    expect(respuesta.statusCode).toBe(401);
  });

  it('una ruta inexistente responde 404 aunque no haya sesión', async () => {
    app = appConRutas();
    const respuesta = await app.inject({ method: 'GET', url: '/no/existe' });
    expect(respuesta.statusCode).toBe(404);
  });
});

describe('declaración obligatoria en cada ruta', () => {
  /** Registra una ruta con la configuración dada y arranca; el arranque debe fallar. */
  async function arrancarConRuta(opciones: Record<string, unknown>): Promise<void> {
    app = crearAppPrueba();
    app.route({
      method: 'GET',
      url: '/prueba/mal-declarada',
      handler: () => ({ ok: true }),
      ...opciones,
    });
    await app.ready();
  }

  it('una ruta sin permiso ni acceso hace fallar el arranque', async () => {
    await expect(arrancarConRuta({ schema: { response: respuestaOk } })).rejects.toThrow(
      /exactamente uno de config\.permiso o config\.acceso/,
    );
  });

  it('declarar permiso y acceso a la vez también falla', async () => {
    await expect(
      arrancarConRuta({
        config: { permiso: 'usuario.gestionar', acceso: 'publico' },
        schema: { response: respuestaOk },
      }),
    ).rejects.toThrow(/exactamente uno/);
  });

  it('un permiso que no existe hace fallar el arranque', async () => {
    await expect(
      arrancarConRuta({
        config: { permiso: 'remesa.borrar_todo' },
        schema: { response: respuestaOk },
      }),
    ).rejects.toThrow(/permiso que no existe/);
  });

  it('una ruta sin esquema de respuesta hace fallar el arranque', async () => {
    await expect(arrancarConRuta({ config: { acceso: 'publico' } })).rejects.toThrow(
      /schema\.response/,
    );
  });
});
