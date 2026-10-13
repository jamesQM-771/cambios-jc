import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ItemCola, RespuestaCola } from '../../modulos/cola/tipos.js';
import { sesionFalsa, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

const enEspera = (cambios: Partial<ItemCola> = {}): ItemCola => ({
  id: 't-1',
  estado: 'en_cola',
  enviadaEn: new Date(Date.now() - 5 * 60_000).toISOString(),
  montoBolivares: '43085.106',
  tomadaPorMi: false,
  pago: {
    tipo: 'cuenta_bancaria',
    banco: { codigo: '0102', nombre: 'Banco de Venezuela' },
    numeroCuenta: null,
    telefonoPagoMovil: null,
    titular: null,
    tipoDocumentoTitular: null,
    numeroDocumentoTitular: null,
  },
  ...cambios,
});

const tomada = (): ItemCola =>
  enEspera({
    id: 't-2',
    estado: 'tomada',
    tomadaPorMi: true,
    pago: {
      tipo: 'cuenta_bancaria',
      banco: { codigo: '0102', nombre: 'Banco de Venezuela' },
      numeroCuenta: '01020000000000000001',
      telefonoPagoMovil: null,
      titular: 'Pedro Titular',
      tipoDocumentoTitular: 'V',
      numeroDocumentoTitular: '12345678',
    },
  });

const cola = (remesas: ItemCola[], extra: Partial<RespuestaCola> = {}) => ({
  cuerpo: {
    remesas,
    cuentasOrigen: [
      { id: 'o-1', nombre: 'Banesco VES', comisionPorDefecto: '1.500' },
      { id: 'o-2', nombre: 'Mercantil VES', comisionPorDefecto: null },
    ],
    ultimaCuentaOrigenId: 'o-2',
    ...extra,
  },
});

describe('cola de pagos', () => {
  it('lleva al digitador directo a la cola, sin menú, y muestra solo banco y monto', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('digitador') },
      'GET /cola': cola([enEspera()]),
    });

    renderizarApp('/');

    expect(await screen.findByRole('heading', { name: 'Cola de pagos' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Menú principal' })).not.toBeInTheDocument();
    expect(await screen.findByText('VES 43.085,106')).toBeInTheDocument();
    expect(screen.getByText(/Banco de Venezuela · Cuenta/)).toBeInTheDocument();
    expect(screen.getByText('hace 5 min')).toBeInTheDocument();
    // Nada de a quién pagar hasta tomarla.
    expect(screen.queryByText('Pedro Titular')).not.toBeInTheDocument();
  });

  it('tomar una pide al servidor y refresca la cola', async () => {
    let tomadaYa = false;
    const api = simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('digitador') },
      'GET /cola': () => cola(tomadaYa ? [tomada()] : [enEspera({ id: 't-2' })]),
      'POST /cola/t-2/tomar': () => {
        tomadaYa = true;
        return { cuerpo: { remesa: tomada() } };
      },
    });
    const { usuario } = renderizarApp('/cola');

    await usuario.click(await screen.findByRole('button', { name: 'Tomar' }));

    await waitFor(() => expect(api.de('POST', '/cola/t-2/tomar')).toHaveLength(1));
    expect(await screen.findByText('Pedro Titular')).toBeInTheDocument();
    expect(screen.getByText('0102 0000 0000 0000 0001')).toBeInTheDocument();
    expect(screen.getByText('V 12345678')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar cuenta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar monto' })).toBeInTheDocument();
  });

  it('completa con la captura, la cuenta sugerida y los datos opcionales', async () => {
    const api = simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('digitador') },
      'GET /cola': cola([tomada()]),
      'POST /cola/t-2/completar': { cuerpo: { remesa: { id: 't-2', estado: 'completada' } } },
    });
    const { usuario } = renderizarApp('/cola');

    const cuenta = await screen.findByLabelText('Cuenta desde la que pagaste');
    // La última que usó esa persona viene elegida.
    expect(cuenta).toHaveValue('o-2');
    await usuario.selectOptions(cuenta, 'o-1');
    await usuario.type(screen.getByLabelText('Referencia del banco (opcional)'), 'REF-998877');
    await usuario.type(screen.getByLabelText('Costo bancario (opcional)'), '2,5');
    const boton = screen.getByRole('button', { name: 'Completar transferencia' });
    expect(boton).toBeDisabled();
    await usuario.upload(
      screen.getByLabelText('Captura del comprobante'),
      new File([new Uint8Array(20)], 'captura.png', { type: 'image/png' }),
    );
    await usuario.click(boton);

    await waitFor(() => expect(api.de('POST', '/cola/t-2/completar')).toHaveLength(1));
    const formulario = api.de('POST', '/cola/t-2/completar')[0]?.formulario;
    expect(formulario?.get('cuentaOrigenId')).toBe('o-1');
    expect(formulario?.get('referenciaBancaria')).toBe('REF-998877');
    expect(formulario?.get('costoBancario')).toBe('2.5');
    expect(formulario?.get('comprobante')).toBeInstanceOf(File);
  });

  it('reporta una incidencia con motivo', async () => {
    const api = simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('digitador') },
      'GET /cola': cola([tomada()]),
      'POST /cola/t-2/incidencia': { cuerpo: { remesa: { id: 't-2', estado: 'con_incidencia' } } },
    });
    const { usuario } = renderizarApp('/cola');

    await usuario.click(await screen.findByRole('button', { name: 'No pude pagarla' }));
    const dialogo = screen.getByRole('dialog', { name: 'Reportar incidencia' });
    const enviar = within(dialogo).getByRole('button', { name: 'Reportar incidencia' });
    expect(enviar).toBeDisabled();
    await usuario.type(within(dialogo).getByLabelText('Qué pasó'), 'La cuenta está cerrada');
    await usuario.click(enviar);

    await waitFor(() => expect(api.de('POST', '/cola/t-2/incidencia')).toHaveLength(1));
    expect(api.de('POST', '/cola/t-2/incidencia')[0]?.cuerpo).toEqual({
      motivo: 'La cuenta está cerrada',
    });
  });

  it('puede devolver a la cola una transferencia que tomó', async () => {
    const api = simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('digitador') },
      'GET /cola': cola([tomada()]),
      'POST /cola/t-2/devolver': { cuerpo: { remesa: { id: 't-2', estado: 'en_cola' } } },
    });
    const { usuario } = renderizarApp('/cola');

    await usuario.click(await screen.findByRole('button', { name: 'Devolver a la cola' }));

    await waitFor(() => expect(api.de('POST', '/cola/t-2/devolver')).toHaveLength(1));
  });

  it('con la cola vacía lo dice', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('digitador') },
      'GET /cola': cola([]),
    });

    renderizarApp('/cola');

    expect(await screen.findByText('No hay transferencias por pagar')).toBeInTheDocument();
  });

  it('quien vende no ve la cola de pagos', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /remesas': { cuerpo: { remesas: [] } },
    });

    renderizarApp('/cola');

    expect(await screen.findByText(/no tienes permiso/i)).toBeInTheDocument();
  });
});
