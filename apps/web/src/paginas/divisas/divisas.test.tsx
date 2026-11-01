import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { OpcionesDivisa, OperacionDivisa } from '../../modulos/divisas/tipos.js';
import { sesionFalsa, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

import { previaDivisa } from './FormularioDivisa.js';

const opciones = (cambios: Partial<OpcionesDivisa> = {}): OpcionesDivisa => ({
  lineas: [
    {
      id: 'l-1',
      nombre: 'Dólares',
      moneda: 'USD',
      monedaLocal: 'COP',
      tasaCompra: '3950.000000',
      tasaVenta: '4100.000000',
      denominaciones: [
        { id: 'd-100', valor: '100.00' },
        { id: 'd-20', valor: '20.00' },
      ],
    },
  ],
  miTurno: { id: 't-1', caja: { id: 'c-1', nombre: 'Caja 1' }, monedas: ['COP', 'USD'] },
  puedeCambiarTasa: false,
  ...cambios,
});

const operacionFalsa = (cambios: Partial<OperacionDivisa> = {}): OperacionDivisa => ({
  id: 'op-1',
  numeroComprobante: 501,
  tipo: 'compra',
  lineaNegocio: { id: 'l-1', nombre: 'Dólares' },
  moneda: 'USD',
  montoDivisa: '260.00',
  montoPesos: '1027000.00',
  tasaCalculada: '3950.000000',
  tasaUsada: '3950.000000',
  motivoTasa: null,
  clienteNombre: null,
  clienteDocumento: null,
  turno: { id: 't-1', caja: { id: 'c-1', nombre: 'Caja 1' } },
  billetes: [],
  ganancia: null,
  creadoPor: { id: 'u-1', nombre: 'Laura' },
  creadoEn: '2026-11-01T15:00:00.000Z',
  anulado: null,
  ...cambios,
});

const recibo = (esCopia: boolean) => ({
  recibo: {
    esCopia,
    operacion: operacionFalsa(),
    empresa: {
      nombre: 'Cambios JC',
      nit: null,
      whatsapp: null,
      textoPie: null,
      zonaHoraria: 'America/Bogota',
    },
  },
});

describe('previaDivisa', () => {
  it('suma los billetes y convierte con la tasa', () => {
    expect(
      previaDivisa(
        [
          { valor: '100.00', cantidad: 2 },
          { valor: '20.00', cantidad: 3 },
        ],
        '3950',
      ),
    ).toEqual({ divisa: '260.00', pesos: '1027000.00' });
  });

  it('sin billetes o sin tasa no hay pesos', () => {
    expect(previaDivisa([], '3950').pesos).toBeNull();
    expect(previaDivisa([{ valor: '100.00', cantidad: 1 }], null).pesos).toBeNull();
  });
});

function abrir(rol: 'vendedor' | 'administrador', opcionesServidor = opciones()) {
  vi.stubGlobal('print', vi.fn());
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa(rol) },
    'GET /divisas': { cuerpo: { operaciones: [operacionFalsa()] } },
    'GET /divisas/opciones': { cuerpo: opcionesServidor },
    'POST /divisas': { estado: 201, cuerpo: { operacion: operacionFalsa() } },
    'POST /divisas/op-1/imprimir': { cuerpo: recibo(false) },
    'POST /divisas/op-1/anular': { cuerpo: { operacion: operacionFalsa() } },
  });
  return { api, ...renderizarApp('/divisas') };
}

describe('pantalla de divisas', () => {
  it('el vendedor compra dólares contando billetes, y sale el recibo', async () => {
    const { api, usuario } = abrir('vendedor');
    await usuario.click(await screen.findByRole('button', { name: 'Nueva operación' }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nueva operación' }));
    await usuario.type(await dialogo.findByLabelText('Cantidad de USD 100,00'), '2');
    await usuario.type(dialogo.getByLabelText('Cantidad de USD 20,00'), '3');
    expect(dialogo.getByText('USD 260,00')).toBeInTheDocument();
    expect(dialogo.getByText('COP 1.027.000')).toBeInTheDocument();
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar compra' }));

    await waitFor(() => expect(api.de('POST', '/divisas')).toHaveLength(1));
    expect(api.de('POST', '/divisas')[0]?.cuerpo).toEqual({
      claveIdempotencia: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
      tipo: 'compra',
      lineaNegocioId: 'l-1',
      montoDivisa: '260.00',
      billetes: [
        { denominacionId: 'd-100', cantidad: 2 },
        { denominacionId: 'd-20', cantidad: 3 },
      ],
    });
    const ticket = await screen.findByRole('article', { name: 'Recibo 501' });
    expect(ticket).toHaveTextContent('Compra de divisa');
  });

  it('sin turno avisa y no muestra el formulario', async () => {
    const { usuario } = abrir('vendedor', opciones({ miTurno: null }));
    await usuario.click(await screen.findByRole('button', { name: 'Nueva operación' }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nueva operación' }));
    expect(await dialogo.findByText(/Abre tu turno de caja/)).toBeInTheDocument();
  });

  it('el vendedor no anula; el administrador sí, con motivo', async () => {
    abrir('vendedor');
    const tabla = await screen.findByRole('table');
    expect(within(tabla).queryByRole('button', { name: /^Anular/ })).toBeNull();
  });

  it('el administrador anula con motivo', async () => {
    const { api, usuario } = abrir('administrador');
    const tabla = await screen.findByRole('table');
    await usuario.click(within(tabla).getByRole('button', { name: /^Anular/ }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Anular la operación' }));
    await usuario.type(dialogo.getByLabelText('Motivo'), 'Billete falso');
    await usuario.click(dialogo.getByRole('button', { name: 'Anular operación' }));
    await waitFor(() => expect(api.de('POST', '/divisas/op-1/anular')).toHaveLength(1));
  });
});
