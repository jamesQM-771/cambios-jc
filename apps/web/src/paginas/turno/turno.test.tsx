import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { OpcionesTurno, Turno } from '../../modulos/turnos/tipos.js';
import { errorApi, sesionFalsa, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

const MONEDA_COP = {
  moneda: 'COP',
  cuenta: { id: 'cu-1', nombre: 'Efectivo COP' },
  denominaciones: [
    { id: 'd-50', valor: '50000.000' },
    { id: 'd-20', valor: '20000.000' },
  ],
};

const caja = (cambios: Record<string, unknown> = {}) => ({
  id: 'caja-1',
  nombre: 'Caja 1',
  sucursal: { id: 's-1', nombre: 'Cúcuta' },
  ocupadaPor: null,
  monedas: [MONEDA_COP],
  ...cambios,
});

const turnoFalso = (cambios: Partial<Turno> = {}): Turno => ({
  id: 't-1',
  caja: { id: 'caja-1', nombre: 'Caja 1' },
  usuario: { id: 'id-vendedor', nombre: 'Persona vendedor' },
  estado: 'abierto',
  abiertoEn: '2026-10-22T13:00:00.000Z',
  cerradoEn: null,
  cerradoPor: null,
  motivoCierre: null,
  jornada: { id: 'j-1', fecha: '2026-10-22' },
  saldos: [
    {
      momento: 'apertura',
      moneda: 'COP',
      esperado: '150000.00',
      contado: '160000.00',
      diferencia: '10000.00',
      explicacion: null,
      resultado: null,
    },
  ],
  conteos: [],
  ...cambios,
});

const opciones = (cambios: Partial<OpcionesTurno> = {}): OpcionesTurno => ({
  cajas: [caja(), caja({ id: 'caja-2', nombre: 'Caja 2', ocupadaPor: 'Laura Pérez' })],
  miTurno: null,
  ...cambios,
});

const cantidadDe = (etiqueta: string) => screen.getByLabelText(etiqueta);

describe('abrir el turno', () => {
  it('ofrece solo las cajas libres y muestra el total mientras se cuenta', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /turnos/opciones': { cuerpo: opciones() },
    });
    const { usuario } = renderizarApp('/turno');

    const selector = await screen.findByLabelText('Caja');
    expect(within(selector).getByRole('option', { name: /Caja 1/ })).toBeInTheDocument();
    expect(within(selector).queryByRole('option', { name: /Caja 2/ })).toBeNull();

    await usuario.type(cantidadDe('Cantidad de COP 50.000'), '2');
    await usuario.type(cantidadDe('Cantidad de COP 20.000'), '3');

    expect(screen.getByText('COP 160.000')).toBeInTheDocument();
  });

  it('solo acepta dígitos en la cantidad', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /turnos/opciones': { cuerpo: opciones() },
    });
    const { usuario } = renderizarApp('/turno');

    await usuario.type(await screen.findByLabelText('Cantidad de COP 50.000'), 'a5b-');

    expect(screen.getByLabelText('Cantidad de COP 50.000')).toHaveValue('5');
  });

  it('manda el conteo al servidor (solo lo contado) y pasa a mostrar el turno abierto', async () => {
    let abierto = false;
    const api = simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /turnos/opciones': () => ({
        cuerpo: opciones({ miTurno: abierto ? turnoFalso() : null }),
      }),
      'POST /turnos': () => {
        abierto = true;
        return { estado: 201, cuerpo: { turno: turnoFalso() } };
      },
    });
    const { usuario } = renderizarApp('/turno');
    await usuario.type(await screen.findByLabelText('Cantidad de COP 50.000'), '2');
    await usuario.type(screen.getByLabelText('Cantidad de COP 20.000'), '0');

    await usuario.click(screen.getByRole('button', { name: 'Abrir turno' }));

    expect(await screen.findByText('Turno abierto en Caja 1')).toBeInTheDocument();
    expect(api.de('POST', '/turnos')[0]?.cuerpo).toEqual({
      cajaId: 'caja-1',
      conteos: [{ moneda: 'COP', lineas: [{ denominacionId: 'd-50', cantidad: 2 }] }],
    });
    // El arqueo de la apertura se ve con su diferencia.
    expect(screen.getByText('Sobrante')).toBeInTheDocument();
  });

  it('si todas las cajas están ocupadas lo explica', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /turnos/opciones': {
        cuerpo: opciones({ cajas: [caja({ ocupadaPor: 'Laura Pérez' })] }),
      },
    });

    renderizarApp('/turno');

    expect(await screen.findByText(/Todas las cajas tienen un turno abierto/)).toBeInTheDocument();
  });

  it('sin cajas configuradas dice cómo seguir', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /turnos/opciones': { cuerpo: opciones({ cajas: [] }) },
    });

    renderizarApp('/turno');

    expect(await screen.findByText('No hay cajas configuradas')).toBeInTheDocument();
  });

  it('muestra el error del servidor y no pierde lo contado', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /turnos/opciones': { cuerpo: opciones() },
      'POST /turnos': errorApi(409, 'ESTADO_INVALIDO', 'La jornada de hoy ya está cerrada.'),
    });
    const { usuario } = renderizarApp('/turno');
    await usuario.type(await screen.findByLabelText('Cantidad de COP 50.000'), '4');

    await usuario.click(screen.getByRole('button', { name: 'Abrir turno' }));

    expect(await screen.findByText('La jornada de hoy ya está cerrada.')).toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad de COP 50.000')).toHaveValue('4');
  });
});

describe('cerrar el turno', () => {
  const conTurnoAbierto = (cierre: Parameters<typeof simularApi>[0] = {}) =>
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /turnos/opciones': { cuerpo: opciones({ miTurno: turnoFalso() }) },
      ...cierre,
    });

  const abrirCierre = async () => {
    const pantalla = renderizarApp('/turno');
    await pantalla.usuario.click(await screen.findByRole('button', { name: 'Cerrar turno' }));
    return {
      ...pantalla,
      dialogo: within(await screen.findByRole('dialog', { name: 'Cerrar turno' })),
    };
  };

  it('muestra el turno abierto con su arqueo de apertura', async () => {
    conTurnoAbierto();

    renderizarApp('/turno');

    expect(await screen.findByText('Turno abierto en Caja 1')).toBeInTheDocument();
    expect(screen.getByText('COP 160.000')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'registrar remesas' })).toBeInTheDocument();
  });

  it('cuenta el efectivo, cierra y deja ver el resultado del arqueo', async () => {
    const cerrado = turnoFalso({
      estado: 'cerrado',
      cerradoEn: '2026-10-22T22:00:00.000Z',
      saldos: [
        {
          momento: 'cierre',
          moneda: 'COP',
          esperado: '160000.00',
          contado: '140000.00',
          diferencia: '-20000.00',
          explicacion: 'Un billete de vueltos',
          resultado: 'faltante',
        },
      ],
    });
    const api = conTurnoAbierto({
      'POST /turnos/t-1/cerrar': { cuerpo: { turno: cerrado } },
    });
    const { usuario, dialogo } = await abrirCierre();
    await usuario.type(dialogo.getByLabelText('Cantidad de COP 50.000'), '2');
    await usuario.type(dialogo.getByLabelText('Cantidad de COP 20.000'), '2');
    await usuario.type(
      dialogo.getByLabelText('Explicación de la diferencia en COP'),
      'Un billete de vueltos',
    );

    await usuario.click(dialogo.getByRole('button', { name: 'Cerrar turno' }));

    expect(await screen.findByRole('heading', { name: 'Turno cerrado' })).toBeInTheDocument();
    expect(screen.getByText('Faltante')).toBeInTheDocument();
    expect(screen.getByText('Un billete de vueltos')).toBeInTheDocument();
    expect(api.de('POST', '/turnos/t-1/cerrar')[0]?.cuerpo).toEqual({
      conteos: [
        {
          moneda: 'COP',
          lineas: [
            { denominacionId: 'd-50', cantidad: 2 },
            { denominacionId: 'd-20', cantidad: 2 },
          ],
        },
      ],
      explicaciones: [{ moneda: 'COP', texto: 'Un billete de vueltos' }],
    });
  });

  it('si no cuadra y falta la explicación, el servidor lo dice y se puede corregir', async () => {
    let intentos = 0;
    const api = conTurnoAbierto({
      'POST /turnos/t-1/cerrar': () => {
        intentos += 1;
        return intentos === 1
          ? errorApi(400, 'VALIDACION_FALLIDA', 'Los datos enviados no son válidos.', [
              {
                campo: 'explicaciones',
                mensaje: 'El efectivo en COP no cuadra: explica a qué se debe la diferencia.',
              },
            ])
          : { cuerpo: { turno: turnoFalso({ estado: 'cerrado' }) } };
      },
    });
    const { usuario, dialogo } = await abrirCierre();
    await usuario.type(dialogo.getByLabelText('Cantidad de COP 50.000'), '1');

    await usuario.click(dialogo.getByRole('button', { name: 'Cerrar turno' }));
    expect(await dialogo.findByText(/no cuadra: explica a qué se debe/)).toBeInTheDocument();
    // El turno sigue abierto y lo contado se conserva.
    expect(dialogo.getByLabelText('Cantidad de COP 50.000')).toHaveValue('1');

    await usuario.type(
      dialogo.getByLabelText('Explicación de la diferencia en COP'),
      'Faltó plata',
    );
    await usuario.click(dialogo.getByRole('button', { name: 'Cerrar turno' }));

    await waitFor(() => expect(api.de('POST', '/turnos/t-1/cerrar')).toHaveLength(2));
    expect(api.de('POST', '/turnos/t-1/cerrar')[1]?.cuerpo).toMatchObject({
      explicaciones: [{ moneda: 'COP', texto: 'Faltó plata' }],
    });
    expect(await screen.findByRole('heading', { name: 'Turno cerrado' })).toBeInTheDocument();
  });

  it('cancelar no cierra nada', async () => {
    const api = conTurnoAbierto();
    const { usuario, dialogo } = await abrirCierre();

    await usuario.click(dialogo.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Cerrar turno' })).toBeNull());
    expect(api.de('POST', '/turnos/t-1/cerrar')).toHaveLength(0);
  });
});

describe('acceso', () => {
  it('el digitador no entra: su trabajo no pasa por la caja', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('digitador') },
      'GET /cola': { cuerpo: { remesas: [], cuentasOrigen: [], ultimaCuentaOrigenId: null } },
    });

    renderizarApp('/turno');

    expect(await screen.findByText(/no tienes permiso/i)).toBeInTheDocument();
  });

  it('el administrador también tiene su turno', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
      'GET /turnos/opciones': { cuerpo: opciones() },
    });

    renderizarApp('/turno');

    expect(await screen.findByRole('button', { name: 'Abrir turno' })).toBeInTheDocument();
  });
});
