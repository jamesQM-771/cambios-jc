import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sesionFalsa, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

function abrir(costo: string | null = '3.775000') {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /inventario': {
      cuerpo: {
        inventarios: [
          {
            moneda: 'VES',
            cantidad: '4000.000',
            costoPromedio: costo,
            saldoCuentas: '3950.500',
            actualizadoEn: '2026-11-01T15:00:00.000Z',
          },
        ],
      },
    },
    'GET /inventario/VES/movimientos': {
      cuerpo: {
        movimientos: [
          {
            id: 'mi-1',
            origen: 'remesa_pago',
            sentido: 'salida',
            cantidad: '1000.000',
            tasa: '3.775000',
            cantidadDespues: '4000.000',
            costoDespues: '3.775000',
            compraId: null,
            operacion: { id: 'op-1', numeroComprobante: 12448 },
            nota: null,
            usuario: { id: 'u-2', nombre: 'Digitador' },
            creadoEn: '2026-11-01T15:00:00.000Z',
          },
        ],
      },
    },
    'POST /inventario/VES/ajustes': {
      cuerpo: {
        inventario: {
          moneda: 'VES',
          cantidad: '5000.000',
          costoPromedio: '3.760000',
          saldoCuentas: '3950.500',
          actualizadoEn: null,
        },
      },
    },
  });
  return { api, ...renderizarApp('/inventario') };
}

describe('pantalla de inventario', () => {
  it('muestra inventario, costo promedio, saldo real e historial', async () => {
    abrir();
    const tarjeta = await screen.findByLabelText('Inventario en VES');
    expect(within(tarjeta).getByText('VES 4.000,000')).toBeInTheDocument();
    expect(within(tarjeta).getByText('3,775')).toBeInTheDocument();
    expect(within(tarjeta).getByText('VES 3.950,500')).toBeInTheDocument();
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText('Remesa N° 12448')).toBeInTheDocument();
  });

  it('sin costo avisa que las remesas no tendrán ganancia', async () => {
    abrir(null);
    expect(await screen.findByText(/no tendrán\s+ganancia calculada/)).toBeInTheDocument();
  });

  it('la entrada pide tasa y motivo', async () => {
    const { api, usuario } = abrir();
    await usuario.click(await screen.findByRole('button', { name: 'Ajustar inventario' }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Ajustar inventario' }));
    await usuario.type(dialogo.getByLabelText('Cantidad (VES)'), '1000');
    const guardar = dialogo.getByRole('button', { name: 'Guardar ajuste' });
    expect(guardar).toBeDisabled();
    await usuario.type(dialogo.getByLabelText('Costo por unidad (tasa)'), '3,7');
    await usuario.type(dialogo.getByLabelText('Motivo'), 'Inventario inicial');
    await usuario.click(guardar);
    await waitFor(() => expect(api.de('POST', '/inventario/VES/ajustes')).toHaveLength(1));
    expect(api.de('POST', '/inventario/VES/ajustes')[0]?.cuerpo).toEqual({
      sentido: 'entrada',
      cantidad: '1000',
      tasa: '3.7',
      motivo: 'Inventario inicial',
    });
  });
});
