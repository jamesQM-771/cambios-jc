import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ErrorApi } from './lib/api.js';
import { CLAVE_SESION } from './modulos/auth/sesion.js';
import {
  errorApi,
  sesionFalsa,
  sesionIncompleta,
  simularApi,
  sinSesion,
} from './pruebas/api-falsa.js';
import { renderizarApp } from './pruebas/renderizar.js';

const ROLES_CON_SESION = ['administrador', 'vendedor', 'digitador'] as const;

describe('rutas protegidas', () => {
  it.each([
    ['sin sesión', sinSesion],
    ['con la sesión a medias (falta el 2FA)', sesionIncompleta],
  ])('%s: no se abre nada y se va al acceso', async (_caso, respuesta) => {
    simularApi({
      'GET /auth/yo': respuesta,
      'GET /empresa/logo': errorApi(404, 'NO_ENCONTRADO', 'x'),
    });

    renderizarApp('/usuarios');

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Usuarios' })).not.toBeInTheDocument();
    // Un primer acceso no lleva ningún aviso de sesión vencida.
    expect(screen.queryByText(/expiró/)).not.toBeInTheDocument();
  });

  it('si no se puede consultar la sesión, lo dice en lugar de mostrar el acceso', async () => {
    simularApi({ 'GET /auth/yo': errorApi(500, 'ERROR_INTERNO', 'Ocurrió un error.') });

    renderizarApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo comprobar tu sesión');
  });

  it('una sesión que se pierde estando dentro lleva al acceso con el aviso de que expiró', async () => {
    let vigente = true;
    simularApi({
      'GET /auth/yo': () => (vigente ? { cuerpo: sesionFalsa('administrador') } : sinSesion()),
      'GET /empresa/logo': errorApi(404, 'NO_ENCONTRADO', 'x'),
    });
    const { cliente } = renderizarApp('/');
    expect(
      await screen.findByRole('heading', { name: /Hola, Persona administrador/ }),
    ).toBeInTheDocument();

    vigente = false;
    await cliente.invalidateQueries({ queryKey: CLAVE_SESION });

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Tu sesión expiró. Inicia sesión de nuevo.',
    );
  });

  it('cualquier petición que responda "no hay sesión" saca a la persona del sistema', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
      'GET /empresa/logo': errorApi(404, 'NO_ENCONTRADO', 'x'),
    });
    const { cliente } = renderizarApp('/');
    await screen.findByRole('heading', { name: /Hola/ });

    // Una consulta de cualquier pantalla recibe 401: la sesión local se descarta sin esperar a /auth/yo.
    await cliente
      .query({
        queryKey: ['otra-consulta'],
        queryFn: () => Promise.reject(new ErrorApi(401, 'NO_AUTENTICADO', 'Debes iniciar sesión.')),
      })
      .catch(() => undefined);

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión expiró');
  });

  it('un error 401 de credenciales o de código no cierra la sesión de quien está dentro', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('administrador') } });
    const { cliente } = renderizarApp('/');
    await screen.findByRole('heading', { name: /Hola/ });

    await cliente
      .query({
        queryKey: ['otra-consulta'],
        queryFn: () =>
          Promise.reject(new ErrorApi(401, 'CODIGO_INVALIDO', 'El código no es correcto.')),
      })
      .catch(() => undefined);

    expect(screen.getByRole('heading', { name: /Hola/ })).toBeInTheDocument();
  });
});

describe('menús por rol', () => {
  it('el administrador ve el menú completo', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('administrador') } });

    renderizarApp('/');

    const menu = await screen.findByRole('navigation', { name: 'Menú principal' });
    expect(
      within(menu)
        .getAllByRole('link')
        .map((enlace) => enlace.textContent),
    ).toEqual(['Inicio', 'Usuarios', 'Empresa', 'Bitácora']);
    expect(within(menu).getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it.each(['vendedor', 'digitador'] as const)(
    'el %s no ve menú lateral: estructura mínima con solo la bienvenida',
    async (rol) => {
      simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa(rol) } });

      renderizarApp('/');

      expect(
        await screen.findByRole('heading', { name: `Hola, Persona ${rol}` }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Menú principal' })).not.toBeInTheDocument();
      expect(screen.getByText(/Por ahora no tienes pantallas disponibles/)).toBeInTheDocument();
    },
  );

  it('los tres roles ven menús distintos entre sí', async () => {
    const vistos: Record<string, number> = {};
    for (const rol of ROLES_CON_SESION) {
      simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa(rol) } });
      const { unmount } = renderizarApp('/');
      await screen.findByRole('heading', { name: /Hola/ });
      const menu = screen.queryByRole('navigation', { name: 'Menú principal' });
      vistos[rol] = menu ? within(menu).getAllByRole('link').length : 0;
      unmount();
    }

    expect(vistos).toEqual({ administrador: 4, vendedor: 0, digitador: 0 });
  });

  it('el encabezado muestra la empresa, el nombre y el rol de la persona', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('digitador') } });

    renderizarApp('/');

    const encabezado = await screen.findByRole('banner');
    expect(within(encabezado).getByText('Casa de Cambio Ejemplo')).toBeInTheDocument();
    expect(within(encabezado).getByText('Persona digitador')).toBeInTheDocument();
    expect(within(encabezado).getByText('Digitador')).toBeInTheDocument();
  });

  it('el logo de la empresa se pide a /api', async () => {
    const sesion = sesionFalsa('administrador');
    simularApi({
      'GET /auth/yo': {
        cuerpo: { ...sesion, empresa: { ...sesion.empresa, logoUrl: '/empresa/logo?v=abc' } },
      },
    });

    const { container } = renderizarApp('/');

    await screen.findByRole('banner');
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/empresa/logo?v=abc');
  });
});

describe('permisos de las pantallas', () => {
  it('quien no tiene el permiso ve "Sin acceso" aunque escriba la dirección', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') } });

    renderizarApp('/usuarios');

    expect(await screen.findByRole('heading', { name: 'Sin acceso' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso');
  });

  it.each([
    ['/usuarios', 'Usuarios'],
    ['/empresa', 'Empresa'],
    ['/bitacora', 'Bitácora'],
  ])('el administrador abre %s', async (ruta, titulo) => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
      'GET /usuarios': { cuerpo: { usuarios: [], total: 0, pagina: 1, porPagina: 20 } },
      'GET /sucursales': { cuerpo: { sucursales: [] } },
      'GET /auditoria': { cuerpo: { registros: [], total: 0, pagina: 1, porPagina: 50 } },
      'GET /empresa': {
        cuerpo: {
          empresa: {
            ...sesionFalsa('administrador').empresa,
            actualizadaEn: '2026-03-10T15:00:00.000Z',
          },
        },
      },
    });

    renderizarApp(ruta);

    expect(await screen.findByRole('heading', { name: titulo, level: 1 })).toBeInTheDocument();
  });

  it('una dirección que no existe muestra la página no encontrada dentro del sistema', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('administrador') } });

    renderizarApp('/no-existe');

    expect(
      await screen.findByRole('heading', { name: 'Página no encontrada' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/');
  });
});

describe('salir y tema', () => {
  it('Salir cierra la sesión en el servidor y vuelve al acceso', async () => {
    let abierta = true;
    const api = simularApi({
      'GET /auth/yo': () => (abierta ? { cuerpo: sesionFalsa('administrador') } : sinSesion()),
      'POST /auth/logout': () => {
        abierta = false;
        return { cuerpo: { ok: true } };
      },
      'GET /empresa/logo': errorApi(404, 'NO_ENCONTRADO', 'x'),
    });
    const { usuario } = renderizarApp('/');

    await usuario.click(await screen.findByRole('button', { name: 'Salir' }));

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(api.de('POST', '/auth/logout')).toHaveLength(1);
    // Salir por decisión propia no muestra el aviso de sesión vencida.
    expect(screen.queryByText(/expiró/)).not.toBeInTheDocument();
  });

  it('Salir lleva al acceso aunque el servidor no responda', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
      'POST /auth/logout': errorApi(500, 'ERROR_INTERNO', 'x'),
      'GET /empresa/logo': errorApi(404, 'NO_ENCONTRADO', 'x'),
    });
    const { usuario } = renderizarApp('/');

    await usuario.click(await screen.findByRole('button', { name: 'Salir' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument(),
    );
  });

  it('el botón de tema cambia entre claro y oscuro', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('administrador') } });
    const { usuario } = renderizarApp('/');

    const boton = await screen.findByRole('button', { name: /Cambiar al tema/ });
    const antes = document.documentElement.dataset.tema;
    await usuario.click(boton);

    expect(document.documentElement.dataset.tema).not.toBe(antes);
    expect(['claro', 'oscuro']).toContain(document.documentElement.dataset.tema);
  });

  it('el menú de celular se abre y se cierra con el botón Menú', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('administrador') } });
    const { usuario } = renderizarApp('/');

    const boton = await screen.findByRole('button', { name: 'Menú' });
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    await usuario.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('navigation', { name: 'Menú principal' })).toHaveAttribute(
      'data-abierto',
      'true',
    );

    await usuario.click(screen.getByRole('link', { name: 'Usuarios' }));
    expect(screen.getByRole('button', { name: 'Menú' })).toHaveAttribute('aria-expanded', 'false');
  });
});
