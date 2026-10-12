import { describe, expect, it, vi } from 'vitest';

import { errorApi, simularApi } from '../pruebas/api-falsa.js';

import { api, ErrorApi, erroresPorCampo, mensajeDe, urlApi } from './api.js';

describe('urlApi', () => {
  it('antepone /api a la ruta', () => {
    expect(urlApi('/empresa/logo?v=abc')).toBe('/api/empresa/logo?v=abc');
  });
});

describe('api.get', () => {
  it('devuelve el cuerpo JSON y pide a /api con la cookie de sesión', async () => {
    const llamadas = simularApi({ 'GET /usuarios': { cuerpo: { total: 2 } } });

    const respuesta = await api.get<{ total: number }>('/usuarios');

    expect(respuesta).toEqual({ total: 2 });
    expect(llamadas.llamadas[0]).toMatchObject({ metodo: 'GET', ruta: '/usuarios' });
  });

  it('arma la consulta y omite los valores vacíos', async () => {
    const llamadas = simularApi({ 'GET /usuarios': {} });

    await api.get('/usuarios', {
      busqueda: 'ana',
      rol: '',
      activo: false,
      pagina: 2,
      vacio: undefined,
    });

    const consulta = llamadas.llamadas[0]?.consulta;
    expect(Object.fromEntries(consulta ?? [])).toEqual({
      busqueda: 'ana',
      activo: 'false',
      pagina: '2',
    });
  });
});

describe('api.post y api.patch', () => {
  it('envían JSON', async () => {
    const llamadas = simularApi({ 'POST /auth/login': {}, 'PATCH /empresa': {} });

    await api.post('/auth/login', { login: 'ana' });
    await api.patch('/empresa', { nombre: 'Casa' });

    expect(llamadas.llamadas.map((llamada) => llamada.cuerpo)).toEqual([
      { login: 'ana' },
      { nombre: 'Casa' },
    ]);
  });

  it('un POST sin cuerpo no manda cabecera de JSON', async () => {
    simularApi({ 'POST /auth/logout': {} });

    await api.post('/auth/logout');

    const [, opciones] =
      (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0] ?? [];
    expect(opciones?.headers).toBeUndefined();
  });
});

describe('api.subir', () => {
  it('envía el formulario tal cual, sin fijar el tipo de contenido', async () => {
    const llamadas = simularApi({ 'POST /empresa/logo': {} });
    const formulario = new FormData();
    formulario.set('logo', new File(['x'], 'logo.png', { type: 'image/png' }));

    await api.subir('/empresa/logo', formulario);

    expect(llamadas.llamadas[0]?.formulario?.get('logo')).toBeInstanceOf(File);
    const [, opciones] =
      (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0] ?? [];
    expect(opciones?.headers).toBeUndefined();
  });
});

describe('errores', () => {
  it('convierte el error de la API en ErrorApi con código, mensaje y detalles', async () => {
    simularApi({
      'POST /auth/login': errorApi(
        401,
        'CREDENCIALES_INVALIDAS',
        'Usuario o contraseña incorrectos.',
        [{ campo: 'login', mensaje: 'Revisa el usuario.' }],
      ),
    });

    const error = await api.post('/auth/login', {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorApi);
    expect(error).toMatchObject({
      estado: 401,
      codigo: 'CREDENCIALES_INVALIDAS',
      message: 'Usuario o contraseña incorrectos.',
    });
  });

  it('una respuesta que no es JSON da un mensaje genérico, no el texto del servidor', async () => {
    const falso = () =>
      Promise.resolve(new Response('<html>Error interno</html>', { status: 500 }));
    vi.stubGlobal('fetch', falso);

    const error = await api.get('/salud').catch((e: unknown) => e);

    expect(error).toMatchObject({ estado: 500, codigo: 'ERROR_DESCONOCIDO' });
    expect(mensajeDe(error)).toBe('Ocurrió un error inesperado. Inténtalo de nuevo.');
    expect(mensajeDe(error)).not.toContain('Error interno');
  });

  it.each([502, 503, 504])(
    'si el proxy responde %i (la API aún no arranca) lo dice claro en vez del mensaje genérico',
    async (estado) => {
      const falso = () =>
        Promise.resolve(new Response('<html>Bad gateway</html>', { status: estado }));
      vi.stubGlobal('fetch', falso);

      const error = await api.post('/auth/login', {}).catch((e: unknown) => e);

      expect(error).toMatchObject({ estado, codigo: 'SERVIDOR_NO_DISPONIBLE' });
      expect(mensajeDe(error)).toMatch(/El servidor todavía no responde/);
      expect(mensajeDe(error)).not.toContain('Bad gateway');
    },
  );

  it('un 503 con el formato de la API conserva el mensaje de la API', async () => {
    const cuerpo = {
      error: { codigo: 'BASE_NO_DISPONIBLE', mensaje: 'La base de datos no responde.' },
    };
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response(JSON.stringify(cuerpo), { status: 503 })),
    );

    const error = await api.get('/salud').catch((e: unknown) => e);

    expect(error).toMatchObject({ estado: 503, codigo: 'BASE_NO_DISPONIBLE' });
    expect(mensajeDe(error)).toBe('La base de datos no responde.');
  });

  it('si no hay conexión responde con un error SIN_CONEXION en español', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));

    const error = await api.get('/salud').catch((e: unknown) => e);

    expect(error).toMatchObject({ estado: 0, codigo: 'SIN_CONEXION' });
    expect(mensajeDe(error)).toMatch(/No se pudo conectar/);
  });

  it('erroresPorCampo devuelve un mensaje por campo y la primera vez gana', () => {
    const error = new ErrorApi(400, 'VALIDACION_FALLIDA', 'x', [
      { campo: 'nit', mensaje: 'NIT inválido' },
      { campo: 'nit', mensaje: 'otro' },
      { campo: 'nombre', mensaje: 'Falta el nombre' },
      { sinCampo: true },
    ]);

    expect(erroresPorCampo(error)).toEqual({ nit: 'NIT inválido', nombre: 'Falta el nombre' });
    expect(erroresPorCampo(new Error('x'))).toEqual({});
    expect(erroresPorCampo(new ErrorApi(400, 'X', 'y'))).toEqual({});
  });
});
