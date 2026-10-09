import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Denominacion } from '../../../modulos/denominaciones/tipos.js';
import {
  errorApi,
  sesionFalsa,
  simularApi,
  type PeticionFalsa,
  type RespuestaFalsa,
} from '../../../pruebas/api-falsa.js';
import { renderizarApp } from '../../../pruebas/renderizar.js';

const denominacionFalsa = (cambios: Partial<Denominacion> = {}): Denominacion => ({
  id: 'd-1',
  moneda: 'COP',
  valor: '50000.00',
  activa: true,
  ...cambios,
});

function abrirDenominaciones(
  denominaciones: Denominacion[] = [denominacionFalsa()],
  extra: Record<string, RespuestaFalsa | ((peticion: PeticionFalsa) => RespuestaFalsa)> = {},
) {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /denominaciones': { cuerpo: { denominaciones } },
    ...extra,
  });
  return { api, ...renderizarApp('/configuracion/denominaciones') };
}

describe('pantalla de denominaciones', () => {
  it('lista las denominaciones con su moneda', async () => {
    abrirDenominaciones();

    const tabla = await screen.findByRole('table');
    expect(tabla).toHaveTextContent('Pesos colombianos (COP)');
    expect(tabla).toHaveTextContent('50000.00');
  });

  it('filtra por moneda', async () => {
    const { usuario } = abrirDenominaciones([
      denominacionFalsa(),
      denominacionFalsa({ id: 'd-2', moneda: 'USD', valor: '100.00' }),
    ]);
    await screen.findByRole('table');

    await usuario.selectOptions(screen.getByLabelText('Moneda'), 'Dólares (USD)');

    const tabla = screen.getByRole('table');
    expect(tabla).toHaveTextContent('100.00');
    expect(tabla).not.toHaveTextContent('50000.00');
  });

  it('crea una denominación', async () => {
    const { usuario } = abrirDenominaciones([], {
      'POST /denominaciones': () => ({
        estado: 201,
        cuerpo: { denominacion: denominacionFalsa({ id: 'd-2', valor: '20000.00' }) },
      }),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Nueva denominación' }));
    await usuario.type(screen.getByLabelText('Valor'), '20000');
    await usuario.click(screen.getByRole('button', { name: 'Crear denominación' }));

    expect(await screen.findByText('Se creó la denominación.')).toBeInTheDocument();
  });

  it('editar solo pide el valor (no la moneda)', async () => {
    const { api, usuario } = abrirDenominaciones([denominacionFalsa()], {
      'PATCH /denominaciones/d-1': () => ({
        cuerpo: { denominacion: denominacionFalsa({ valor: '20000.00' }) },
      }),
    });
    await usuario.click(await screen.findByRole('button', { name: /Editar/ }));

    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).queryByLabelText('Moneda')).not.toBeInTheDocument();
    await usuario.clear(screen.getByLabelText('Valor'));
    await usuario.type(screen.getByLabelText('Valor'), '20000');
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(api.de('PATCH', '/denominaciones/d-1')).toHaveLength(1));
    expect(api.de('PATCH', '/denominaciones/d-1')[0]?.cuerpo).toEqual({ valor: '20000' });
  });

  it('un vendedor no puede entrar', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') } });
    renderizarApp('/configuracion/denominaciones');

    expect(await screen.findByRole('heading', { name: 'Sin acceso' })).toBeInTheDocument();
  });

  it('si la lista falla, lo dice', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
      'GET /denominaciones': errorApi(500, 'ERROR_INTERNO', 'Ocurrió un error.'),
    });
    renderizarApp('/configuracion/denominaciones');

    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error.');
  });
});
