import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { etiquetaSaldo } from '../../modulos/contrapartes/saldo.js';
import type { Contraparte, MovimientoContraparte } from '../../modulos/contrapartes/tipos.js';
import { sesionFalsa, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

const contraparteFalsa = (cambios: Partial<Contraparte> = {}): Contraparte => ({
  id: 'cp-1',
  nombre: 'Sara Castro',
  tipo: 'proveedor',
  documento: 'V-12345678',
  telefono: null,
  notas: null,
  activa: true,
  creadoEn: '2026-11-01T15:00:00.000Z',
  saldos: [
    { moneda: 'COP', saldo: '50000.00' },
    { moneda: 'VES', saldo: '-1500.125' },
  ],
  cuentasTitular: [{ id: 'cu-9', nombre: 'VZLA Sara Castro', moneda: 'VES' }],
  ...cambios,
});

const movimientoFalso = (cambios: Partial<MovimientoContraparte> = {}): MovimientoContraparte => ({
  id: 'mv-1',
  tipo: 'anticipo_proveedor',
  moneda: 'COP',
  monto: '50000.00',
  signo: 1,
  cuenta: { id: 'cu-1', nombre: 'Bóveda' },
  nota: null,
  revierteId: null,
  anulacion: null,
  compraId: null,
  usuario: { id: 'u-1', nombre: 'Admin' },
  creadoEn: '2026-11-01T15:00:00.000Z',
  ...cambios,
});

describe('etiquetaSaldo', () => {
  it('nunca muestra signo: "Me debe" o "Le debo"', () => {
    expect(etiquetaSaldo('COP', '50000.00')).toBe('Me debe COP 50.000');
    expect(etiquetaSaldo('VES', '-1500.125')).toBe('Le debo VES 1.500,125');
  });
});

function abrir(extra: Record<string, { cuerpo: unknown; estado?: number }> = {}) {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /contrapartes': { cuerpo: { contrapartes: [contraparteFalsa()] } },
    'GET /contrapartes/resumen': {
      cuerpo: { resumen: [{ moneda: 'COP', meDeben: '50000.00', lesDebo: '0.00' }] },
    },
    'GET /contrapartes/cp-1': {
      cuerpo: { contraparte: contraparteFalsa(), movimientos: [movimientoFalso()] },
    },
    'GET /contrapartes/opciones': {
      cuerpo: {
        contrapartes: [{ id: 'cp-1', nombre: 'Sara Castro', tipo: 'proveedor' }],
        cuentas: [{ id: 'cu-1', nombre: 'Bóveda', tipo: 'caja', moneda: 'COP' }],
      },
    },
    'POST /contrapartes': { estado: 201, cuerpo: { contraparte: contraparteFalsa() } },
    'POST /contrapartes/cp-1/movimientos': {
      estado: 201,
      cuerpo: { movimiento: movimientoFalso() },
    },
    'POST /contrapartes/movimientos/mv-1/anular': { cuerpo: { movimiento: movimientoFalso() } },
    ...extra,
  });
  return { api, ...renderizarApp('/contrapartes') };
}

describe('pantalla de contrapartes', () => {
  it('lista con saldos por moneda y etiquetas, y filtra por "Me deben"', async () => {
    const { api, usuario } = abrir();
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText('Sara Castro')).toBeInTheDocument();
    expect(within(tabla).getByText('Me debe COP 50.000')).toBeInTheDocument();
    expect(within(tabla).getByText('Le debo VES 1.500,125')).toBeInTheDocument();

    await usuario.selectOptions(screen.getByLabelText('Mostrar'), 'me_deben');
    await waitFor(() =>
      expect(
        api.de('GET', '/contrapartes').some((p) => p.consulta.get('saldo') === 'me_deben'),
      ).toBe(true),
    );
  });

  it('crea una contraparte', async () => {
    const { api, usuario } = abrir();
    await usuario.click(await screen.findByRole('button', { name: 'Nueva contraparte' }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nueva contraparte' }));
    await usuario.type(dialogo.getByLabelText('Nombre'), 'Jhon Cano');
    await usuario.selectOptions(dialogo.getByLabelText('Tipo'), 'socio');
    await usuario.click(dialogo.getByRole('button', { name: 'Crear contraparte' }));
    await waitFor(() => expect(api.de('POST', '/contrapartes')).toHaveLength(1));
    expect(api.de('POST', '/contrapartes')[0]?.cuerpo).toMatchObject({
      nombre: 'Jhon Cano',
      tipo: 'socio',
      documento: null,
    });
  });

  it('registra un préstamo que sale de una cuenta, con clave de idempotencia', async () => {
    const { api, usuario } = abrir();
    await usuario.click(
      await screen.findByRole('button', { name: 'Ver la cuenta de Sara Castro' }),
    );
    const dialogo = within(await screen.findByRole('dialog', { name: 'Cuenta corriente' }));
    expect(await dialogo.findByText(/Cuentas a su nombre: VZLA Sara Castro/)).toBeInTheDocument();
    await usuario.click(dialogo.getByRole('button', { name: 'Nuevo movimiento' }));
    await usuario.selectOptions(
      await dialogo.findByLabelText('Tipo de movimiento'),
      'prestamo_otorgado',
    );
    await usuario.type(dialogo.getByLabelText('Monto (COP)'), '200.000');
    // "200.000" es ambiguo: no se envía hasta aclararlo.
    expect(dialogo.getByRole('button', { name: 'Registrar movimiento' })).toBeDisabled();
    await usuario.clear(dialogo.getByLabelText('Monto (COP)'));
    await usuario.type(dialogo.getByLabelText('Monto (COP)'), '200000');
    await usuario.selectOptions(dialogo.getByLabelText('Cuenta (si movió dinero)'), 'cu-1');
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar movimiento' }));

    await waitFor(() => expect(api.de('POST', '/contrapartes/cp-1/movimientos')).toHaveLength(1));
    expect(api.de('POST', '/contrapartes/cp-1/movimientos')[0]?.cuerpo).toEqual({
      claveIdempotencia: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
      tipo: 'prestamo_otorgado',
      moneda: 'COP',
      monto: '200000',
      cuentaId: 'cu-1',
    });
  });

  it('un ajuste pide efecto y nota, y no ofrece cuenta', async () => {
    const { usuario } = abrir();
    await usuario.click(
      await screen.findByRole('button', { name: 'Ver la cuenta de Sara Castro' }),
    );
    const dialogo = within(await screen.findByRole('dialog', { name: 'Cuenta corriente' }));
    await usuario.click(await dialogo.findByRole('button', { name: 'Nuevo movimiento' }));
    await usuario.selectOptions(await dialogo.findByLabelText('Tipo de movimiento'), 'ajuste');
    expect(dialogo.queryByLabelText(/^Cuenta/)).toBeNull();
    await usuario.type(dialogo.getByLabelText('Monto (COP)'), '1000');
    const boton = dialogo.getByRole('button', { name: 'Registrar movimiento' });
    expect(boton).toBeDisabled();
    await usuario.selectOptions(dialogo.getByLabelText('Efecto en la cuenta corriente'), '-1');
    expect(boton).toBeDisabled();
    await usuario.type(dialogo.getByLabelText('Nota (obligatoria)'), 'Saldo del Excel');
    expect(boton).toBeEnabled();
  });

  it('anula un movimiento con motivo', async () => {
    const { api, usuario } = abrir();
    await usuario.click(
      await screen.findByRole('button', { name: 'Ver la cuenta de Sara Castro' }),
    );
    const dialogo = within(await screen.findByRole('dialog', { name: 'Cuenta corriente' }));
    await usuario.click(
      await dialogo.findByRole('button', { name: 'Anular Anticipo a proveedor' }),
    );
    await usuario.type(dialogo.getByLabelText('Motivo'), 'Se registró dos veces');
    await usuario.click(dialogo.getByRole('button', { name: 'Anular movimiento' }));
    await waitFor(() =>
      expect(api.de('POST', '/contrapartes/movimientos/mv-1/anular')).toHaveLength(1),
    );
  });

  it('el vendedor no entra', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') } });
    renderizarApp('/contrapartes');
    expect(await screen.findByText(/No tienes permiso|no tienes acceso/i)).toBeInTheDocument();
  });
});
