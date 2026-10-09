import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Caja } from '../../../modulos/cajas/tipos.js';
import {
  errorApi,
  sesionFalsa,
  simularApi,
  type PeticionFalsa,
  type RespuestaFalsa,
} from '../../../pruebas/api-falsa.js';
import { renderizarApp } from '../../../pruebas/renderizar.js';

const cajaFalsa = (cambios: Partial<Caja> = {}): Caja => ({
  id: 'c-1',
  nombre: 'Caja 1',
  sucursalId: 's-1',
  sucursalNombre: 'Principal',
  activa: true,
  ...cambios,
});

const SUCURSALES = { sucursales: [{ id: 's-1', nombre: 'Principal', ciudad: 'Cúcuta' }] };

function abrirCajas(
  cajas: Caja[] = [cajaFalsa()],
  extra: Record<string, RespuestaFalsa | ((peticion: PeticionFalsa) => RespuestaFalsa)> = {},
) {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /cajas': { cuerpo: { cajas } },
    'GET /sucursales': { cuerpo: SUCURSALES },
    ...extra,
  });
  return { api, ...renderizarApp('/configuracion/cajas') };
}

describe('pantalla de cajas', () => {
  it('lista las cajas con su sucursal', async () => {
    abrirCajas();

    const tabla = await screen.findByRole('table');
    expect(tabla).toHaveTextContent('Caja 1');
    expect(tabla).toHaveTextContent('Principal');
  });

  it('crea una caja eligiendo la sucursal', async () => {
    const { usuario } = abrirCajas([], {
      'POST /cajas': () => ({
        estado: 201,
        cuerpo: { caja: cajaFalsa({ id: 'c-2', nombre: 'Caja 2' }) },
      }),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Nueva caja' }));
    await usuario.type(screen.getByLabelText('Nombre'), 'Caja 2');
    await waitFor(() => expect(screen.getByLabelText('Sucursal')).not.toBeDisabled());
    await usuario.selectOptions(screen.getByLabelText('Sucursal'), 'Principal · Cúcuta');
    await usuario.click(screen.getByRole('button', { name: 'Crear caja' }));

    expect(await screen.findByText('Se creó la caja.')).toBeInTheDocument();
  });

  it('desactivar pide confirmación', async () => {
    const { usuario } = abrirCajas([cajaFalsa()], {
      'POST /cajas/c-1/desactivar': { cuerpo: { caja: cajaFalsa({ activa: false }) } },
    });
    await usuario.click(await screen.findByRole('button', { name: 'Desactivar Caja 1' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('¿Desactivar caja?');

    await usuario.click(screen.getByRole('button', { name: 'Sí, desactivar' }));

    expect(await screen.findByText('Caja 1 fue desactivada.')).toBeInTheDocument();
  });

  it('un vendedor no puede entrar', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') } });
    renderizarApp('/configuracion/cajas');

    expect(await screen.findByRole('heading', { name: 'Sin acceso' })).toBeInTheDocument();
  });

  it('si la lista falla, lo dice', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
      'GET /cajas': errorApi(500, 'ERROR_INTERNO', 'Ocurrió un error.'),
      'GET /sucursales': { cuerpo: SUCURSALES },
    });
    renderizarApp('/configuracion/cajas');

    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error.');
  });
});

describe('editar caja', () => {
  it('solo pide el nombre (no la sucursal)', async () => {
    const { api, usuario } = abrirCajas([cajaFalsa()], {
      'PATCH /cajas/c-1': () => ({ cuerpo: { caja: cajaFalsa({ nombre: 'Caja Uno' }) } }),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Editar Caja 1' }));

    expect(screen.queryByLabelText('Sucursal')).not.toBeInTheDocument();
    await usuario.clear(screen.getByLabelText('Nombre'));
    await usuario.type(screen.getByLabelText('Nombre'), 'Caja Uno');
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(api.de('PATCH', '/cajas/c-1')).toHaveLength(1));
    expect(api.de('PATCH', '/cajas/c-1')[0]?.cuerpo).toEqual({ nombre: 'Caja Uno' });
  });
});
