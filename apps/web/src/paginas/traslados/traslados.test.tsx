import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { OpcionesTraslado, Traslado } from '../../modulos/traslados/tipos.js';
import { errorApi, sesionFalsa, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

import { destinosPosibles } from './FormularioTraslado.js';

const CUENTAS: OpcionesTraslado['cuentas'] = [
  { id: 'c-1', nombre: 'Efectivo Caja 1', tipo: 'caja', moneda: 'COP', cajaId: 'caja-1' },
  { id: 'c-2', nombre: 'Efectivo Caja 2', tipo: 'caja', moneda: 'COP', cajaId: 'caja-2' },
  { id: 'c-3', nombre: 'Bóveda', tipo: 'caja', moneda: 'COP', cajaId: null },
  { id: 'c-4', nombre: 'Banco Uno', tipo: 'banco', moneda: 'COP', cajaId: null },
  { id: 'c-5', nombre: 'Efectivo USD', tipo: 'caja', moneda: 'USD', cajaId: 'caja-1' },
];

const opciones = (cambios: Partial<OpcionesTraslado> = {}): OpcionesTraslado => ({
  cuentas: CUENTAS,
  miTurno: { id: 't-1', caja: { id: 'caja-1', nombre: 'Caja 1' } },
  puedeCualquierCuenta: false,
  ...cambios,
});

const trasladoFalso = (cambios: Partial<Traslado> = {}): Traslado => ({
  id: 'tr-1',
  origen: { id: 'c-1', nombre: 'Efectivo Caja 1', moneda: 'COP' },
  destino: { id: 'c-3', nombre: 'Bóveda', moneda: 'COP' },
  monto: '500000.00',
  nota: null,
  turno: { id: 't-1', caja: { id: 'caja-1', nombre: 'Caja 1' } },
  creadoPor: { id: 'u-1', nombre: 'Persona vendedor' },
  creadoEn: '2026-10-22T15:00:00.000Z',
  anulado: null,
  ...cambios,
});

describe('destinosPosibles', () => {
  const origen = (id: string) => CUENTAS.find((c) => c.id === id);

  it('el vendedor solo mueve desde o hacia la caja de su turno, en la misma moneda', () => {
    // Desde su caja: cualquier cuenta en pesos menos ella misma.
    expect(destinosPosibles(CUENTAS, origen('c-1'), 'caja-1', false).map((c) => c.id)).toEqual([
      'c-2',
      'c-3',
      'c-4',
    ]);
    // Desde la bóveda: solo hacia su caja.
    expect(destinosPosibles(CUENTAS, origen('c-3'), 'caja-1', false).map((c) => c.id)).toEqual([
      'c-1',
    ]);
    // Desde un banco que no es suyo, y sin ser administrador, solo su caja.
    expect(destinosPosibles(CUENTAS, origen('c-4'), 'caja-1', false).map((c) => c.id)).toEqual([
      'c-1',
    ]);
  });

  it('el administrador mueve entre cualesquiera cuentas de la misma moneda', () => {
    expect(destinosPosibles(CUENTAS, origen('c-3'), null, true).map((c) => c.id)).toEqual([
      'c-1',
      'c-2',
      'c-4',
    ]);
  });

  it('sin cuenta de origen no hay destinos', () => {
    expect(destinosPosibles(CUENTAS, undefined, 'caja-1', true)).toEqual([]);
  });
});

describe('registrar un traslado', () => {
  it('el vendedor traslada de su caja a la bóveda con la clave de idempotencia', async () => {
    const { api, usuario } = await abrir('vendedor');

    await usuario.click(await screen.findByRole('button', { name: 'Nuevo traslado' }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nuevo traslado' }));
    await usuario.selectOptions(await dialogo.findByLabelText('Entra a'), 'c-3');
    await usuario.type(dialogo.getByLabelText(/^Monto/), '500.000,50');
    await usuario.type(dialogo.getByLabelText('Nota (opcional)'), 'Excedente de la mañana');
    await usuario.click(dialogo.getByRole('button', { name: 'Trasladar' }));

    await waitFor(() => expect(api.de('POST', '/traslados')).toHaveLength(1));
    expect(api.de('POST', '/traslados')[0]?.cuerpo).toEqual({
      claveIdempotencia: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
      origenId: 'c-1',
      destinoId: 'c-3',
      monto: '500000.50',
      nota: 'Excedente de la mañana',
    });
  });

  it('un monto ambiguo como 3.200 no se envía', async () => {
    const { api, usuario } = await abrir('vendedor');

    await usuario.click(await screen.findByRole('button', { name: 'Nuevo traslado' }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nuevo traslado' }));
    await usuario.type(await dialogo.findByLabelText(/^Monto/), '3.200');

    expect(dialogo.getByRole('button', { name: 'Trasladar' })).toBeDisabled();
    expect(api.de('POST', '/traslados')).toHaveLength(0);
  });

  it('sin turno abierto el vendedor recibe el aviso y no ve el formulario', async () => {
    const { usuario } = await abrir('vendedor', opciones({ miTurno: null }));

    await usuario.click(await screen.findByRole('button', { name: 'Nuevo traslado' }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nuevo traslado' }));
    expect(await dialogo.findByText(/Abre tu turno de caja/)).toBeInTheDocument();
    expect(dialogo.queryByLabelText('Sale de')).toBeNull();
  });

  it('un rechazo del servidor se muestra dentro del cuadro y conserva lo escrito', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /traslados/opciones': { cuerpo: opciones() },
      'POST /traslados': errorApi(
        409,
        'ESTADO_INVALIDO',
        'Los montos en COP no admiten ese número de decimales.',
      ),
    });
    const { usuario } = renderizarApp('/traslados');
    await usuario.click(await screen.findByRole('button', { name: 'Nuevo traslado' }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nuevo traslado' }));
    await usuario.type(await dialogo.findByLabelText(/^Monto/), '1000.555');
    await usuario.click(dialogo.getByRole('button', { name: 'Trasladar' }));

    expect(await dialogo.findByText(/no admiten ese número de decimales/)).toBeInTheDocument();
    expect(dialogo.getByLabelText(/^Monto/)).toHaveValue('1000.555');
  });
});

describe('historial y anulación', () => {
  it('el vendedor no ve el historial, solo el formulario', async () => {
    await abrir('vendedor');

    expect(await screen.findByRole('button', { name: 'Nuevo traslado' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('el administrador ve el historial y anula con motivo', async () => {
    const { api, usuario } = await abrir(
      'administrador',
      opciones({ puedeCualquierCuenta: true }),
      [
        trasladoFalso(),
        trasladoFalso({
          id: 'tr-2',
          nota: 'Error de digitación',
          anulado: {
            por: { id: 'u-0', nombre: 'Admin' },
            en: '2026-10-22T16:00:00.000Z',
            motivo: 'Monto mal escrito',
          },
        }),
      ],
    );

    const tabla = await screen.findByRole('table');
    expect(within(tabla).getAllByText('COP 500.000')).toHaveLength(2);
    expect(within(tabla).getByText('Monto mal escrito')).toBeInTheDocument();
    // Solo el vigente ofrece anular.
    expect(within(tabla).getAllByRole('button', { name: /^Anular/ })).toHaveLength(1);

    await usuario.click(within(tabla).getByRole('button', { name: /^Anular/ }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Anular el traslado' }));
    const confirmar = dialogo.getByRole('button', { name: 'Anular traslado' });
    expect(confirmar).toBeDisabled();
    await usuario.type(dialogo.getByLabelText('Motivo'), 'Se envió a la cuenta equivocada');
    await usuario.click(confirmar);

    await waitFor(() => expect(api.de('POST', '/traslados/tr-1/anular')).toHaveLength(1));
    expect(api.de('POST', '/traslados/tr-1/anular')[0]?.cuerpo).toEqual({
      motivo: 'Se envió a la cuenta equivocada',
    });
  });
});

async function abrir(
  rol: 'vendedor' | 'administrador',
  opcionesServidor: OpcionesTraslado = opciones(),
  traslados: Traslado[] = [],
) {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa(rol) },
    'GET /traslados/opciones': { cuerpo: opcionesServidor },
    'GET /traslados': { cuerpo: { traslados } },
    'POST /traslados': { cuerpo: { traslado: trasladoFalso() } },
    'POST /traslados/tr-1/anular': {
      cuerpo: { traslado: trasladoFalso({ anulado: null }) },
    },
  });
  const { usuario } = renderizarApp('/traslados');
  await screen.findByRole('heading', { name: 'Traslados' });
  return { api, usuario };
}
