import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Banco } from '../../../modulos/bancos/tipos.js';
import {
  errorApi,
  sesionFalsa,
  simularApi,
  type PeticionFalsa,
  type RespuestaFalsa,
} from '../../../pruebas/api-falsa.js';
import { renderizarApp } from '../../../pruebas/renderizar.js';

const bancoFalso = (cambios: Partial<Banco> = {}): Banco => ({
  id: 'b-1',
  codigo: '0102',
  nombre: 'Banco de Venezuela',
  pais: 'VE',
  activo: true,
  creadoEn: '2026-03-10T15:00:00.000Z',
  ...cambios,
});

function abrirBancos(
  bancos: Banco[] = [bancoFalso()],
  extra: Record<string, RespuestaFalsa | ((peticion: PeticionFalsa) => RespuestaFalsa)> = {},
) {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /bancos': { cuerpo: { bancos } },
    ...extra,
  });
  return { api, ...renderizarApp('/configuracion/bancos') };
}

describe('pantalla de bancos', () => {
  it('lista los bancos, y los inactivos quedan ocultos hasta marcar la casilla', async () => {
    const { usuario } = abrirBancos([bancoFalso(), bancoFalso({ id: 'b-2', activo: false })]);

    const tabla = await screen.findByRole('table');
    expect(tabla).toHaveTextContent('0102');
    expect(tabla).not.toHaveTextContent('Inactivo');

    await usuario.click(screen.getByRole('checkbox', { name: 'Mostrar desactivados' }));

    expect(screen.getByRole('table')).toHaveTextContent('Inactivo');
  });

  it('crea un banco', async () => {
    const { usuario } = abrirBancos([], {
      'POST /bancos': () => ({
        estado: 201,
        cuerpo: { banco: bancoFalso({ id: 'b-3', codigo: '0134', nombre: 'Banesco' }) },
      }),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Nuevo banco' }));
    await usuario.type(screen.getByLabelText('Código'), '0134');
    await usuario.type(screen.getByLabelText('Nombre'), 'Banesco');
    await usuario.click(screen.getByRole('button', { name: 'Crear banco' }));

    expect(await screen.findByText('Se creó el banco.')).toBeInTheDocument();
  });

  it('desactivar pide confirmación', async () => {
    const { usuario } = abrirBancos([bancoFalso()], {
      'POST /bancos/b-1/desactivar': { cuerpo: { banco: bancoFalso({ activo: false }) } },
    });
    await usuario.click(
      await screen.findByRole('button', { name: 'Desactivar Banco de Venezuela' }),
    );
    expect(await screen.findByRole('dialog')).toHaveTextContent('¿Desactivar banco?');

    await usuario.click(screen.getByRole('button', { name: 'Sí, desactivar' }));

    expect(await screen.findByText('Banco de Venezuela fue desactivado.')).toBeInTheDocument();
  });

  it('reactivar no pide confirmación', async () => {
    const { usuario } = abrirBancos([bancoFalso({ activo: false })], {
      'POST /bancos/b-1/reactivar': { cuerpo: { banco: bancoFalso({ activo: true }) } },
    });
    await usuario.click(await screen.findByRole('checkbox', { name: 'Mostrar desactivados' }));

    await usuario.click(screen.getByRole('button', { name: 'Reactivar Banco de Venezuela' }));

    expect(await screen.findByText('Banco de Venezuela fue reactivado.')).toBeInTheDocument();
  });

  it('si la lista falla, lo dice', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
      'GET /bancos': errorApi(500, 'ERROR_INTERNO', 'Ocurrió un error.'),
    });
    renderizarApp('/configuracion/bancos');

    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error.');
  });

  it('un vendedor no puede entrar', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') } });
    renderizarApp('/configuracion/bancos');

    expect(await screen.findByRole('heading', { name: 'Sin acceso' })).toBeInTheDocument();
  });
});

describe('editar banco', () => {
  it('precarga los datos y guarda solo lo que cambió', async () => {
    const { api, usuario } = abrirBancos([bancoFalso()], {
      'PATCH /bancos/b-1': () => ({ cuerpo: { banco: bancoFalso({ nombre: 'BDV' }) } }),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Editar Banco de Venezuela' }));

    expect(screen.getByLabelText('Código')).toHaveValue('0102');
    await usuario.clear(screen.getByLabelText('Nombre'));
    await usuario.type(screen.getByLabelText('Nombre'), 'BDV');
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(api.de('PATCH', '/bancos/b-1')).toHaveLength(1));
    expect(api.de('PATCH', '/bancos/b-1')[0]?.cuerpo).toEqual({ nombre: 'BDV' });
  });
});
