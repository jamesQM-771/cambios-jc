import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CategoriaGasto } from '../../../modulos/categorias-gasto/tipos.js';
import {
  errorApi,
  sesionFalsa,
  simularApi,
  type PeticionFalsa,
  type RespuestaFalsa,
} from '../../../pruebas/api-falsa.js';
import { renderizarApp } from '../../../pruebas/renderizar.js';

const categoriaFalsa = (cambios: Partial<CategoriaGasto> = {}): CategoriaGasto => ({
  id: 'cat-1',
  nombre: 'Transporte',
  activa: true,
  creadoEn: '2026-10-22T15:00:00.000Z',
  ...cambios,
});

function abrirCategorias(
  categorias: CategoriaGasto[] = [categoriaFalsa()],
  extra: Record<string, RespuestaFalsa | ((peticion: PeticionFalsa) => RespuestaFalsa)> = {},
) {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /categorias-gasto': { cuerpo: { categorias } },
    ...extra,
  });
  return { api, ...renderizarApp('/configuracion/categorias-gasto') };
}

describe('pantalla de categorías de gasto', () => {
  it('aparece como una sección de Configuración', async () => {
    abrirCategorias();

    expect(await screen.findByRole('link', { name: 'Categorías de gasto' })).toBeInTheDocument();
  });

  it('lista las categorías, y las desactivadas quedan ocultas hasta marcar la casilla', async () => {
    const { usuario } = abrirCategorias([
      categoriaFalsa(),
      categoriaFalsa({ id: 'cat-2', nombre: 'Papelería', activa: false }),
    ]);

    const tabla = await screen.findByRole('table');
    expect(tabla).toHaveTextContent('Transporte');
    expect(tabla).not.toHaveTextContent('Papelería');

    await usuario.click(screen.getByRole('checkbox', { name: 'Mostrar desactivadas' }));

    expect(screen.getByRole('table')).toHaveTextContent('Papelería');
  });

  it('crea una categoría', async () => {
    const { api, usuario } = abrirCategorias([], {
      'POST /categorias-gasto': () => ({
        estado: 201,
        cuerpo: { categoria: categoriaFalsa({ id: 'cat-3', nombre: 'Servicios' }) },
      }),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Nueva categoría' }));
    await usuario.type(screen.getByLabelText('Nombre'), '  Servicios ');
    await usuario.click(screen.getByRole('button', { name: 'Crear categoría' }));

    expect(await screen.findByText('Se creó la categoría.')).toBeInTheDocument();
    expect(api.de('POST', '/categorias-gasto')[0]?.cuerpo).toEqual({ nombre: 'Servicios' });
  });

  it('muestra el error del servidor, por ejemplo un nombre repetido', async () => {
    const { usuario } = abrirCategorias([], {
      'POST /categorias-gasto': errorApi(
        409,
        'CONFLICTO',
        'Ya existe una categoría con ese nombre.',
      ),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Nueva categoría' }));
    await usuario.type(screen.getByLabelText('Nombre'), 'Transporte');
    await usuario.click(screen.getByRole('button', { name: 'Crear categoría' }));

    expect(await screen.findByText('Ya existe una categoría con ese nombre.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Transporte');
  });

  it('edita el nombre', async () => {
    const { api, usuario } = abrirCategorias([categoriaFalsa()], {
      'PATCH /categorias-gasto/cat-1': () => ({
        cuerpo: { categoria: categoriaFalsa({ nombre: 'Taxis' }) },
      }),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Editar Transporte' }));

    expect(screen.getByLabelText('Nombre')).toHaveValue('Transporte');
    await usuario.clear(screen.getByLabelText('Nombre'));
    await usuario.type(screen.getByLabelText('Nombre'), 'Taxis');
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(api.de('PATCH', '/categorias-gasto/cat-1')).toHaveLength(1));
    expect(api.de('PATCH', '/categorias-gasto/cat-1')[0]?.cuerpo).toEqual({ nombre: 'Taxis' });
  });

  it('desactivar pide confirmación', async () => {
    const { usuario } = abrirCategorias([categoriaFalsa()], {
      'POST /categorias-gasto/cat-1/desactivar': {
        cuerpo: { categoria: categoriaFalsa({ activa: false }) },
      },
    });
    await usuario.click(await screen.findByRole('button', { name: 'Desactivar Transporte' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('¿Desactivar categoría?');

    await usuario.click(screen.getByRole('button', { name: 'Sí, desactivar' }));

    expect(await screen.findByText('Transporte fue desactivada.')).toBeInTheDocument();
  });

  it('reactivar no pide confirmación', async () => {
    const { usuario } = abrirCategorias([categoriaFalsa({ activa: false })], {
      'POST /categorias-gasto/cat-1/reactivar': { cuerpo: { categoria: categoriaFalsa() } },
    });
    await usuario.click(await screen.findByRole('checkbox', { name: 'Mostrar desactivadas' }));

    await usuario.click(screen.getByRole('button', { name: 'Reactivar Transporte' }));

    expect(await screen.findByText('Transporte fue reactivada.')).toBeInTheDocument();
  });

  it('un vendedor no puede entrar', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') } });
    renderizarApp('/configuracion/categorias-gasto');

    expect(await screen.findByRole('heading', { name: 'Sin acceso' })).toBeInTheDocument();
  });
});
