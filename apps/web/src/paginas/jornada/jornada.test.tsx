import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DetalleJornada, Jornada, ResumenJornada } from '../../modulos/jornadas/tipos.js';
import type { OpcionesTurno } from '../../modulos/turnos/tipos.js';
import { errorApi, sesionFalsa, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

import { diferenciaDe } from './FormularioCierreJornada.js';

const BOVEDA = { id: 'c-boveda', nombre: 'Bóveda', tipo: 'caja' as const, moneda: 'COP' };
const BANCO = { id: 'c-banco', nombre: 'Banco Uno', tipo: 'banco' as const, moneda: 'COP' };

const jornadaFalsa = (cambios: Partial<Jornada> = {}): Jornada => ({
  id: 'j-1',
  fecha: '2026-10-22',
  estado: 'abierta',
  sucursal: { id: 's-1', nombre: 'Cúcuta' },
  cerradaEn: null,
  cerradaPor: null,
  ciclo: 1,
  turnosAbiertos: 0,
  ...cambios,
});

const resumenFalso = (): ResumenJornada => ({
  fecha: '2026-10-22',
  sucursal: { id: 's-1', nombre: 'Cúcuta' },
  disponible: [
    { cuenta: BOVEDA, caja: null, saldo: '5000000.00', origen: 'esperado' },
    { cuenta: BANCO, caja: null, saldo: null, origen: 'sin_dato' },
  ],
  totalDisponible: [{ moneda: 'COP', total: '5000000.00' }],
  remesas: { registradas: 4, completadas: 3, anuladas: 1, devueltas: 0, pendientes: 0 },
  pesosRecibidos: [{ moneda: 'COP', total: '800000.00' }],
  devoluciones: [],
  costosBancarios: [],
  gastosOperativos: [{ moneda: 'COP', total: '25000.00' }],
  retirosDelDueno: [],
  ganancia: {
    moneda: 'COP',
    remesasCosteadas: 2,
    remesasSinCosto: 0,
    gananciaRemesas: '3585.61',
    costosBancarios: '46.25',
    gastosOperativos: '500.00',
    gananciaDelDia: '3085.61',
  },
  contrapartes: {
    saldos: [{ moneda: 'COP', meDeben: '50000.00', lesDebo: '20000.00' }],
    movimientosDelDia: 1,
  },
  devolucionesPendientes: [],
  posicion: [{ moneda: 'COP', total: '1030000.00' }],
  traslados: 2,
  diferenciasDeArqueo: [
    {
      turnoId: 't-1',
      vendedor: { id: 'u-v', nombre: 'Laura Pérez' },
      caja: 'Caja 1',
      moneda: 'COP',
      diferencia: '-2000.00',
      resultado: 'faltante',
      explicacion: 'Vuelto mal dado',
    },
  ],
});

const detalleFalso = (cambios: Partial<DetalleJornada> = {}): DetalleJornada => ({
  jornada: jornadaFalsa(),
  pendientes: { turnosAbiertos: [], remesasTomadas: 0 },
  cuentasPorArquear: [
    { cuenta: BOVEDA, esperado: '5000000.00' },
    { cuenta: BANCO, esperado: null },
  ],
  saldosReportados: [],
  resumen: resumenFalso(),
  eventos: [],
  ...cambios,
});

const opcionesTurno: OpcionesTurno = {
  cajas: [
    {
      id: 'caja-1',
      nombre: 'Caja 1',
      sucursal: { id: 's-1', nombre: 'Cúcuta' },
      ocupadaPor: 'Laura Pérez',
      monedas: [
        {
          moneda: 'COP',
          cuenta: { id: 'cu-1', nombre: 'Efectivo COP' },
          denominaciones: [{ id: 'd-50', valor: '50000.000' }],
        },
      ],
    },
  ],
  miTurno: null,
};

async function abrir(detalle: DetalleJornada, jornada = detalle.jornada) {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /jornadas': { cuerpo: { jornadas: [jornada] } },
    'GET /jornadas/j-1': { cuerpo: { detalle } },
    'GET /turnos/opciones': { cuerpo: opcionesTurno },
    'POST /jornadas/j-1/cerrar': {
      cuerpo: { detalle: { ...detalle, jornada: jornadaFalsa({ estado: 'cerrada' }) } },
    },
    'POST /jornadas/j-1/reabrir': { cuerpo: { detalle } },
    'POST /turnos/t-1/cerrar': { cuerpo: { turno: { caja: { nombre: 'Caja 1' } } } },
  });
  const { usuario } = renderizarApp('/jornada');
  await usuario.click(
    await screen.findByRole('button', { name: /Abrir la jornada del 2026-10-22/ }),
  );
  return { api, usuario, dialogo: within(await screen.findByRole('dialog', { name: 'Jornada' })) };
}

describe('diferenciaDe', () => {
  it('compara lo reportado con lo esperado, con coma o punto', () => {
    expect(diferenciaDe('4.998.000,50', '5000000.00')).toBe('-1999.5');
    expect(diferenciaDe('5000000', '5000000.00')).toBe('0');
    expect(diferenciaDe('5000500', '5000000.00')).toBe('500');
  });

  it('no calcula si no hay esperado o el texto no es un número', () => {
    expect(diferenciaDe('100', null)).toBeNull();
    expect(diferenciaDe('abc', '100')).toBeNull();
    expect(diferenciaDe('', '100')).toBeNull();
  });
});

describe('cerrar la jornada', () => {
  it('muestra la diferencia al escribir y envía los saldos con la explicación', async () => {
    const { api, usuario, dialogo } = await abrir(detalleFalso());

    await usuario.type(await dialogo.findByLabelText('Saldo real de Bóveda'), '4998000');
    expect(await dialogo.findByText(/Faltante de COP 2\.000/)).toBeInTheDocument();
    await usuario.type(
      dialogo.getByLabelText('Explicación de la diferencia en Bóveda'),
      'Pago a proveedor',
    );
    await usuario.type(dialogo.getByLabelText('Saldo real de Banco Uno'), '1200000');
    await usuario.click(dialogo.getByRole('button', { name: 'Cerrar jornada' }));

    await waitFor(() => expect(api.de('POST', '/jornadas/j-1/cerrar')).toHaveLength(1));
    expect(api.de('POST', '/jornadas/j-1/cerrar')[0]?.cuerpo).toEqual({
      saldos: [
        { cuentaId: 'c-boveda', reportado: '4998000', explicacion: 'Pago a proveedor' },
        { cuentaId: 'c-banco', reportado: '1200000' },
      ],
    });
  });

  it('no deja cerrar mientras falte algún saldo', async () => {
    const { usuario, dialogo } = await abrir(detalleFalso());

    await usuario.type(await dialogo.findByLabelText('Saldo real de Bóveda'), '5000000');

    expect(dialogo.getByRole('button', { name: 'Cerrar jornada' })).toBeDisabled();
  });

  it('con turnos abiertos avisa y no deja cerrar', async () => {
    const { dialogo } = await abrir(
      detalleFalso({
        pendientes: {
          turnosAbiertos: [
            { id: 't-1', caja: 'Caja 1', vendedor: { id: 'u-v', nombre: 'Laura Pérez' } },
          ],
          remesasTomadas: 2,
        },
      }),
    );

    expect(await dialogo.findByText(/Todavía hay turnos abiertos/)).toBeInTheDocument();
    expect(dialogo.getByText(/2 remesas que un digitador tomó/)).toBeInTheDocument();
    expect(dialogo.getByRole('button', { name: 'Cerrar jornada' })).toBeDisabled();
  });

  it('un rechazo del servidor se muestra dentro del cuadro', async () => {
    const api = simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
      'GET /jornadas': { cuerpo: { jornadas: [jornadaFalsa()] } },
      'GET /jornadas/j-1': { cuerpo: { detalle: detalleFalso() } },
      'POST /jornadas/j-1/cerrar': errorApi(
        409,
        'ESTADO_INVALIDO',
        'La Bóveda no cuadra: explica la diferencia.',
      ),
    });
    const { usuario } = renderizarApp('/jornada');
    await usuario.click(await screen.findByRole('button', { name: /Abrir la jornada/ }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Jornada' }));
    await usuario.type(await dialogo.findByLabelText('Saldo real de Bóveda'), '1');
    await usuario.type(dialogo.getByLabelText('Saldo real de Banco Uno'), '1');
    await usuario.click(dialogo.getByRole('button', { name: 'Cerrar jornada' }));

    expect(await dialogo.findByText(/La Bóveda no cuadra/)).toBeInTheDocument();
    expect(api.de('POST', '/jornadas/j-1/cerrar')).toHaveLength(1);
  });
});

describe('turnos olvidados', () => {
  it('el administrador cierra el turno de otra persona con motivo', async () => {
    const { api, usuario, dialogo } = await abrir(
      detalleFalso({
        pendientes: {
          turnosAbiertos: [
            { id: 't-1', caja: 'Caja 1', vendedor: { id: 'u-v', nombre: 'Laura Pérez' } },
          ],
          remesasTomadas: 0,
        },
      }),
    );

    await usuario.click(
      await dialogo.findByRole('button', { name: /Cerrar el turno de Laura Pérez/ }),
    );
    const cierre = within(await screen.findByRole('dialog', { name: 'Cerrar turno' }));
    const enviar = await cierre.findByRole('button', { name: 'Cerrar turno' });
    expect(enviar).toBeDisabled();
    await usuario.type(cierre.getByLabelText('Motivo del cierre'), 'Se fue sin cerrar');
    await usuario.type(cierre.getByLabelText(/50\.000/), '10');
    await usuario.click(enviar);

    await waitFor(() => expect(api.de('POST', '/turnos/t-1/cerrar')).toHaveLength(1));
    expect(api.de('POST', '/turnos/t-1/cerrar')[0]?.cuerpo).toMatchObject({
      motivo: 'Se fue sin cerrar',
      conteos: [{ moneda: 'COP', lineas: [{ denominacionId: 'd-50', cantidad: 10 }] }],
    });
  });
});

describe('jornada cerrada', () => {
  const cerrada = jornadaFalsa({
    estado: 'cerrada',
    cerradaEn: '2026-10-22T23:00:00.000Z',
    cerradaPor: { id: 'u-a', nombre: 'Admin' },
  });

  it('muestra los saldos reportados, el resumen y reabre con motivo', async () => {
    const { api, usuario, dialogo } = await abrir(
      detalleFalso({
        jornada: cerrada,
        cuentasPorArquear: [],
        saldosReportados: [
          {
            cuenta: BOVEDA,
            esperado: '5000000.00',
            reportado: '4998000.00',
            diferencia: '-2000.00',
            explicacion: 'Pago a proveedor',
            resultado: 'faltante',
          },
        ],
        eventos: [
          {
            tipo: 'cierre',
            usuario: { id: 'u-a', nombre: 'Admin' },
            motivo: null,
            creadoEn: '2026-10-22T23:00:00.000Z',
          },
        ],
      }),
    );

    expect(await dialogo.findByText('Pago a proveedor')).toBeInTheDocument();
    expect(dialogo.getByText('Faltante')).toBeInTheDocument();
    // El resumen del día: dinero disponible y diferencias de arqueo de los turnos.
    expect(dialogo.getByText('Total en COP')).toBeInTheDocument();
    expect(dialogo.getByText('Vuelto mal dado')).toBeInTheDocument();
    expect(dialogo.queryByRole('button', { name: 'Cerrar jornada' })).toBeNull();
    // Fase 4: ganancia del día, contrapartes y posición total.
    expect(dialogo.getByRole('heading', { name: 'Ganancia del día' })).toBeInTheDocument();
    expect(dialogo.getByText('COP 3.086')).toBeInTheDocument();
    expect(dialogo.getByText(/Me deben COP 50\.000/)).toBeInTheDocument();
    expect(dialogo.getByText('Posición total')).toBeInTheDocument();

    await usuario.click(dialogo.getByRole('button', { name: 'Reabrir la jornada' }));
    const reapertura = within(await screen.findByRole('dialog', { name: 'Reabrir la jornada' }));
    const confirmar = reapertura.getByRole('button', { name: 'Reabrir jornada' });
    expect(confirmar).toBeDisabled();
    await usuario.type(reapertura.getByLabelText('Motivo'), 'Faltó registrar un gasto');
    await usuario.click(confirmar);

    await waitFor(() => expect(api.de('POST', '/jornadas/j-1/reabrir')).toHaveLength(1));
    expect(api.de('POST', '/jornadas/j-1/reabrir')[0]?.cuerpo).toEqual({
      motivo: 'Faltó registrar un gasto',
    });
  });
});

describe('permisos', () => {
  it('el vendedor no ve la pantalla de jornada', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') } });

    renderizarApp('/jornada');

    expect(await screen.findByText(/no tienes permiso/i)).toBeInTheDocument();
  });
});
