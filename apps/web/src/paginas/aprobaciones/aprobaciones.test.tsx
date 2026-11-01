import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MENSAJE_PENDIENTE, quedoPendiente } from '../../lib/aprobacion.js';
import type { Solicitud } from '../../modulos/aprobaciones.js';
import { sesionFalsa, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

const solicitudFalsa = (cambios: Partial<Solicitud> = {}): Solicitud => ({
  id: 'so-1',
  accion: 'anular_gasto',
  entidadId: 'ga-1',
  descripcion: 'Anular un gasto: Se pagó dos veces',
  estado: 'pendiente',
  solicitante: { id: 'otra-persona', nombre: 'Laura' },
  aprobador: null,
  comentario: null,
  resueltaEn: null,
  creadoEn: '2026-11-01T15:00:00.000Z',
  ...cambios,
});

describe('quedoPendiente', () => {
  it('reconoce la respuesta 202 con la solicitud', () => {
    expect(quedoPendiente({ solicitud: {} })).toBe(true);
    expect(quedoPendiente({ gasto: {} })).toBe(false);
    expect(quedoPendiente(null)).toBe(false);
    expect(MENSAJE_PENDIENTE).toMatch(/pendiente de aprobación/);
  });
});

describe('pantalla de aprobaciones', () => {
  it('aprueba y rechaza lo de otros; lo propio no se puede aprobar', async () => {
    const sesion = sesionFalsa('administrador');
    const api = simularApi({
      'GET /auth/yo': { cuerpo: sesion },
      'GET /aprobaciones': {
        cuerpo: {
          solicitudes: [
            solicitudFalsa(),
            solicitudFalsa({
              id: 'so-2',
              accion: 'reabrir_jornada',
              descripcion: 'Reabrir una jornada: faltó un gasto',
              solicitante: { id: sesion.usuario.id, nombre: 'Yo' },
            }),
          ],
        },
      },
      'GET /aprobaciones/parametros': {
        cuerpo: {
          parametros: {
            reaperturaJornada: true,
            devoluciones: false,
            anulaciones: true,
            ajustes: false,
          },
        },
      },
      'POST /aprobaciones/so-1/aprobar': {
        cuerpo: { solicitud: solicitudFalsa({ estado: 'aprobada' }) },
      },
    });
    const { usuario } = renderizarApp('/aprobaciones');
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText('Tu solicitud: la aprueba otra persona')).toBeInTheDocument();
    expect(within(tabla).getAllByRole('button', { name: /^Aprobar/ })).toHaveLength(1);
    await usuario.click(within(tabla).getByRole('button', { name: 'Aprobar: Anular gasto' }));
    await waitFor(() => expect(api.de('POST', '/aprobaciones/so-1/aprobar')).toHaveLength(1));
    expect(await screen.findByText('Aprobada y ejecutada.')).toBeInTheDocument();
    expect(screen.getByLabelText('Reabrir una jornada cerrada')).toBeChecked();
  });

  it('el vendedor no entra', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') } });
    renderizarApp('/aprobaciones');
    expect(
      await screen.findByText('No tienes permiso para ver esta pantalla.'),
    ).toBeInTheDocument();
  });
});
