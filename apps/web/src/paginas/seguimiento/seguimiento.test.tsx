import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Seguimiento } from '../../modulos/seguimiento/tipos.js';
import { errorApi, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

const seguimiento = (cambios: Partial<Seguimiento> = {}): Seguimiento => ({
  numeroComprobante: 128,
  estado: 'en_proceso',
  mensaje: 'Tu envío está en proceso.',
  montoBolivaresTexto: 'VES 43.085,106',
  fecha: '2026-10-13T19:05:00.000Z',
  actualizadaEn: '2026-10-13T19:20:00.000Z',
  empresa: { nombre: 'Casa de Cambio Ejemplo', zonaHoraria: 'America/Bogota' },
  ...cambios,
});

describe('seguimiento público', () => {
  it('se abre sin iniciar sesión y muestra el estado, el monto y las fechas', async () => {
    const api = simularApi({
      'GET /seguimiento/7K3M9XQ4TB2D': { cuerpo: { seguimiento: seguimiento() } },
    });

    renderizarApp('/seguimiento/7K3M9XQ4TB2D');

    expect(await screen.findByText('En proceso')).toBeInTheDocument();
    expect(screen.getByText('Tu envío está en proceso.')).toBeInTheDocument();
    expect(screen.getByText('N° 128')).toBeInTheDocument();
    expect(screen.getByText('VES 43.085,106')).toBeInTheDocument();
    expect(screen.getByText('Casa de Cambio Ejemplo')).toBeInTheDocument();
    // No pide la sesión: ni siquiera la consulta.
    expect(api.de('GET', '/auth/yo')).toHaveLength(0);
  });

  it('muestra "Enviada" cuando el pago se hizo', async () => {
    simularApi({
      'GET /seguimiento/ABCDEFGHJKMN': {
        cuerpo: {
          seguimiento: seguimiento({ estado: 'enviada', mensaje: 'Tu envío fue realizado.' }),
        },
      },
    });

    renderizarApp('/seguimiento/ABCDEFGHJKMN');

    expect(await screen.findByText('Enviada')).toBeInTheDocument();
    expect(screen.getByText('Tu envío fue realizado.')).toBeInTheDocument();
  });

  it('un código que no existe lo explica y deja escribir otro', async () => {
    simularApi({
      'GET /seguimiento/ZZZZZZZZZZZZ': errorApi(
        404,
        'NO_ENCONTRADO',
        'No encontramos una operación con ese código.',
      ),
    });

    renderizarApp('/seguimiento/ZZZZZZZZZZZZ');

    expect(await screen.findByText(/No encontramos un envío con ese código/)).toBeInTheDocument();
    expect(screen.getByLabelText('Código de seguimiento')).toBeInTheDocument();
  });

  it('sin código muestra el formulario para escribirlo', async () => {
    simularApi({});

    renderizarApp('/seguimiento');

    expect(await screen.findByLabelText('Código de seguimiento')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Consultar' })).toBeDisabled();
  });
});
