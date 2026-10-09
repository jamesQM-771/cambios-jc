import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Sucursal } from '../../../modulos/sucursales/tipos.js';
import {
  errorApi,
  sesionFalsa,
  simularApi,
  type PeticionFalsa,
  type RespuestaFalsa,
} from '../../../pruebas/api-falsa.js';
import { renderizarApp } from '../../../pruebas/renderizar.js';

const sucursalFalsa = (cambios: Partial<Sucursal> = {}): Sucursal => ({
  id: 's-1',
  nombre: 'Principal',
  ciudad: 'Cúcuta',
  activa: true,
  ...cambios,
});

function abrirSucursales(
  sucursales: Sucursal[] = [sucursalFalsa()],
  extra: Record<string, RespuestaFalsa | ((peticion: PeticionFalsa) => RespuestaFalsa)> = {},
) {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /sucursales': { cuerpo: { sucursales } },
    ...extra,
  });
  return { api, ...renderizarApp('/configuracion/sucursales') };
}

describe('pantalla de sucursales', () => {
  it('lista las sucursales, y las inactivas quedan ocultas hasta marcar la casilla', async () => {
    const { usuario } = abrirSucursales([
      sucursalFalsa(),
      sucursalFalsa({ id: 's-2', nombre: 'Segunda', activa: false }),
    ]);

    const tabla = await screen.findByRole('table');
    expect(tabla).toHaveTextContent('Cúcuta');
    expect(tabla).not.toHaveTextContent('Inactivo');

    await usuario.click(await screen.findByRole('checkbox', { name: 'Mostrar desactivadas' }));

    expect(screen.getByRole('table')).toHaveTextContent('Inactivo');
  });

  it('crea una sucursal', async () => {
    const { usuario } = abrirSucursales([], {
      'POST /sucursales': () => ({
        estado: 201,
        cuerpo: { sucursal: sucursalFalsa({ id: 's-3', nombre: 'Segunda', ciudad: 'Bogotá' }) },
      }),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Nueva sucursal' }));
    await usuario.type(screen.getByLabelText('Nombre'), 'Segunda');
    await usuario.type(screen.getByLabelText('Ciudad'), 'Bogotá');
    await usuario.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    expect(await screen.findByText('Se creó la sucursal.')).toBeInTheDocument();
  });

  it('desactivar con usuarios o cajas activas muestra el error del servidor', async () => {
    const { usuario } = abrirSucursales([sucursalFalsa()], {
      'POST /sucursales/s-1/desactivar': () =>
        errorApi(
          409,
          'ESTADO_INVALIDO',
          'No se puede desactivar: tiene 1 usuario(s) activo(s) asignado(s). Reasígnalos o desactívalos primero.',
        ),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Desactivar Principal' }));
    await usuario.click(screen.getByRole('button', { name: 'Sí, desactivar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('tiene 1 usuario(s) activo(s)');
  });

  it('desactivar sin usuarios ni cajas activas funciona', async () => {
    const { usuario } = abrirSucursales([sucursalFalsa()], {
      'POST /sucursales/s-1/desactivar': { cuerpo: { sucursal: sucursalFalsa({ activa: false }) } },
    });
    await usuario.click(await screen.findByRole('button', { name: 'Desactivar Principal' }));
    await usuario.click(screen.getByRole('button', { name: 'Sí, desactivar' }));

    expect(await screen.findByText('Principal fue desactivada.')).toBeInTheDocument();
  });

  it('un vendedor no puede entrar', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') } });
    renderizarApp('/configuracion/sucursales');

    expect(await screen.findByRole('heading', { name: 'Sin acceso' })).toBeInTheDocument();
  });
});

describe('editar sucursal', () => {
  it('precarga los datos y guarda solo lo que cambió', async () => {
    const { api, usuario } = abrirSucursales([sucursalFalsa()], {
      'PATCH /sucursales/s-1': () => ({
        cuerpo: { sucursal: sucursalFalsa({ ciudad: 'Bogotá' }) },
      }),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Editar Principal' }));

    expect(screen.getByLabelText('Nombre')).toHaveValue('Principal');
    await usuario.clear(screen.getByLabelText('Ciudad'));
    await usuario.type(screen.getByLabelText('Ciudad'), 'Bogotá');
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(api.de('PATCH', '/sucursales/s-1')).toHaveLength(1));
    expect(api.de('PATCH', '/sucursales/s-1')[0]?.cuerpo).toEqual({ ciudad: 'Bogotá' });
  });
});
