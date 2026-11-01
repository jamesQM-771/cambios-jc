import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Compra, OpcionesCompra } from '../../modulos/compras/tipos.js';
import { sesionFalsa, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

import { pesosDeLaCompra } from './FormularioCompra.js';

const OPCIONES: OpcionesCompra = {
  monedaLocal: 'COP',
  contrapartes: [{ id: 'cp-1', nombre: 'Sara Castro', saldoLocal: '50000.00' }],
  cuentasDestino: [
    { id: 'cv-1', nombre: 'VZLA Sara', moneda: 'VES', contraparteTitularId: 'cp-1' },
  ],
  cuentasPago: [{ id: 'cu-1', nombre: 'Bóveda', moneda: 'COP' }],
};

const compraFalsa = (cambios: Partial<Compra> = {}): Compra => ({
  id: 'co-1',
  contraparte: { id: 'cp-1', nombre: 'Sara Castro' },
  moneda: 'VES',
  cantidad: '43085.106',
  tasa: '3.760000',
  montoPesos: '162000.00',
  cuentaDestino: { id: 'cv-1', nombre: 'VZLA Sara' },
  formaPago: 'contado',
  cuentaPago: { id: 'cu-1', nombre: 'Bóveda' },
  nota: null,
  creadoPor: { id: 'u-1', nombre: 'Admin' },
  creadoEn: '2026-11-01T15:00:00.000Z',
  anulado: null,
  ...cambios,
});

describe('pesosDeLaCompra (vista previa)', () => {
  it('usa la conversión compartida y redondea a 2 decimales', () => {
    expect(pesosDeLaCompra('43085,106', '3,76')).toBe('162000.00');
    expect(pesosDeLaCompra('1000', '3.7')).toBe('3700.00');
  });

  it('lo que no es número o vale cero no da vista previa', () => {
    expect(pesosDeLaCompra('', '3.7')).toBeNull();
    expect(pesosDeLaCompra('abc', '3.7')).toBeNull();
    expect(pesosDeLaCompra('0', '3.7')).toBeNull();
  });
});

function abrir() {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /compras': {
      cuerpo: {
        compras: [
          compraFalsa(),
          compraFalsa({
            id: 'co-2',
            formaPago: 'credito',
            cuentaPago: null,
            anulado: {
              por: { id: 'u-1', nombre: 'Admin' },
              en: '2026-11-01T16:00:00.000Z',
              motivo: 'No entregó',
            },
          }),
        ],
      },
    },
    'GET /compras/opciones': { cuerpo: OPCIONES },
    'POST /compras': { estado: 201, cuerpo: { compra: compraFalsa() } },
    'POST /compras/co-1/anular': { cuerpo: { compra: compraFalsa() } },
  });
  return { api, ...renderizarApp('/compras') };
}

describe('pantalla de compras', () => {
  it('lista las compras y solo las vigentes se pueden anular', async () => {
    abrir();
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getAllByText('VES 43.085,106')).toHaveLength(2);
    expect(within(tabla).getByText('No entregó')).toBeInTheDocument();
    expect(within(tabla).getAllByRole('button', { name: /^Anular/ })).toHaveLength(1);
  });

  it('registra una compra de contado con la vista previa de los pesos', async () => {
    const { api, usuario } = abrir();
    await usuario.click(await screen.findByRole('button', { name: 'Nueva compra' }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nueva compra' }));
    expect(await dialogo.findByText(/Me debe COP 50.000/)).toBeInTheDocument();
    await usuario.type(dialogo.getByLabelText(/^Cantidad recibida/), '43085,106');
    await usuario.type(dialogo.getByLabelText(/^Tasa de compra/), '3,76');
    expect(dialogo.getByText('COP 162.000')).toBeInTheDocument();
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar compra' }));

    await waitFor(() => expect(api.de('POST', '/compras')).toHaveLength(1));
    expect(api.de('POST', '/compras')[0]?.cuerpo).toEqual({
      claveIdempotencia: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
      contraparteId: 'cp-1',
      cuentaDestinoId: 'cv-1',
      cantidad: '43085.106',
      tasa: '3.76',
      formaPago: 'contado',
      cuentaPagoId: 'cu-1',
    });
  });

  it('a crédito no pide cuenta de pago', async () => {
    const { api, usuario } = abrir();
    await usuario.click(await screen.findByRole('button', { name: 'Nueva compra' }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nueva compra' }));
    await usuario.selectOptions(await dialogo.findByLabelText('Forma de pago'), 'credito');
    expect(dialogo.queryByLabelText('Sale de')).toBeNull();
    await usuario.type(dialogo.getByLabelText(/^Cantidad recibida/), '1000');
    await usuario.type(dialogo.getByLabelText(/^Tasa de compra/), '3,7');
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar compra' }));
    await waitFor(() => expect(api.de('POST', '/compras')).toHaveLength(1));
    expect(api.de('POST', '/compras')[0]?.cuerpo).not.toHaveProperty('cuentaPagoId');
  });

  it('anula con motivo', async () => {
    const { api, usuario } = abrir();
    const tabla = await screen.findByRole('table');
    await usuario.click(within(tabla).getByRole('button', { name: /^Anular/ }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Anular la compra' }));
    await usuario.type(dialogo.getByLabelText('Motivo'), 'Duplicada');
    await usuario.click(dialogo.getByRole('button', { name: 'Anular compra' }));
    await waitFor(() => expect(api.de('POST', '/compras/co-1/anular')).toHaveLength(1));
  });
});
