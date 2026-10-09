import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { LineaNegocio } from '../../../modulos/lineas-negocio/tipos.js';
import {
  errorApi,
  sesionFalsa,
  simularApi,
  type PeticionFalsa,
  type RespuestaFalsa,
} from '../../../pruebas/api-falsa.js';
import { renderizarApp } from '../../../pruebas/renderizar.js';

const lineaFalsa = (cambios: Partial<LineaNegocio> = {}): LineaNegocio => ({
  id: 'l-1',
  nombre: 'Transferencias a Venezuela',
  clase: 'remesa',
  monedaOrigen: 'COP',
  monedaDestino: 'VES',
  activa: true,
  modoTasa: 'porcentaje',
  margenCompra: null,
  margenVenta: '11.000000',
  ...cambios,
});

function abrirLineas(
  lineasNegocio: LineaNegocio[] = [lineaFalsa()],
  extra: Record<string, RespuestaFalsa | ((peticion: PeticionFalsa) => RespuestaFalsa)> = {},
) {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /lineas-negocio': { cuerpo: { lineasNegocio } },
    ...extra,
  });
  return { api, ...renderizarApp('/configuracion/lineas-negocio') };
}

describe('pantalla de líneas de negocio', () => {
  it('lista las líneas con su clase y monedas', async () => {
    abrirLineas();

    const tabla = await screen.findByRole('table');
    expect(tabla).toHaveTextContent('Transferencias a Venezuela');
    expect(tabla).toHaveTextContent('Remesa');
    expect(tabla).toHaveTextContent('COP → VES');
  });

  it('crea una línea de negocio', async () => {
    const { usuario } = abrirLineas([], {
      'POST /lineas-negocio': () => ({
        estado: 201,
        cuerpo: {
          lineaNegocio: lineaFalsa({ id: 'l-2', nombre: 'Dólares', clase: 'divisa_caja' }),
        },
      }),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Nueva línea' }));
    await usuario.type(screen.getByLabelText('Nombre'), 'Dólares');
    await usuario.selectOptions(
      screen.getByLabelText('Clase'),
      'Divisa en caja (compra/venta en efectivo)',
    );
    await usuario.click(screen.getByRole('button', { name: 'Crear línea' }));

    expect(await screen.findByText('Se creó la línea.')).toBeInTheDocument();
  });

  it('editar solo pide el nombre (no la clase ni las monedas)', async () => {
    const { api, usuario } = abrirLineas([lineaFalsa()], {
      'PATCH /lineas-negocio/l-1': () => ({
        cuerpo: { lineaNegocio: lineaFalsa({ nombre: 'Remesas VE' }) },
      }),
    });
    await usuario.click(await screen.findByRole('button', { name: /Editar/ }));

    expect(screen.queryByLabelText('Clase')).not.toBeInTheDocument();
    await usuario.clear(screen.getByLabelText('Nombre'));
    await usuario.type(screen.getByLabelText('Nombre'), 'Remesas VE');
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(api.de('PATCH', '/lineas-negocio/l-1')).toHaveLength(1));
    expect(api.de('PATCH', '/lineas-negocio/l-1')[0]?.cuerpo).toEqual({ nombre: 'Remesas VE' });
  });

  it('desactivar pide confirmación', async () => {
    const { usuario } = abrirLineas([lineaFalsa()], {
      'POST /lineas-negocio/l-1/desactivar': {
        cuerpo: { lineaNegocio: lineaFalsa({ activa: false }) },
      },
    });
    await usuario.click(await screen.findByRole('button', { name: /Desactivar/ }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('¿Desactivar línea de negocio?');

    await usuario.click(screen.getByRole('button', { name: 'Sí, desactivar' }));

    expect(
      await screen.findByText('Transferencias a Venezuela fue desactivada.'),
    ).toBeInTheDocument();
  });

  it('un vendedor no puede entrar', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') } });
    renderizarApp('/configuracion/lineas-negocio');

    expect(await screen.findByRole('heading', { name: 'Sin acceso' })).toBeInTheDocument();
  });

  it('si la lista falla, lo dice', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
      'GET /lineas-negocio': errorApi(500, 'ERROR_INTERNO', 'Ocurrió un error.'),
    });
    renderizarApp('/configuracion/lineas-negocio');

    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error.');
  });
});
