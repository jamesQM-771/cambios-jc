import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Gasto, OpcionesGasto } from '../../modulos/gastos/tipos.js';
import { errorApi, sesionFalsa, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

import { cuentasParaPagar } from './FormularioGasto.js';

const CUENTAS: OpcionesGasto['cuentas'] = [
  { id: 'c-1', nombre: 'Efectivo Caja 1', tipo: 'caja', moneda: 'COP', cajaId: 'caja-1' },
  { id: 'c-2', nombre: 'Efectivo Caja 2', tipo: 'caja', moneda: 'COP', cajaId: 'caja-2' },
  { id: 'c-3', nombre: 'Bóveda', tipo: 'caja', moneda: 'COP', cajaId: null },
  { id: 'c-4', nombre: 'Banco Uno', tipo: 'banco', moneda: 'COP', cajaId: null },
];

const opciones = (cambios: Partial<OpcionesGasto> = {}): OpcionesGasto => ({
  categorias: [
    { id: 'cat-1', nombre: 'Transporte' },
    { id: 'cat-2', nombre: 'Papelería' },
  ],
  cuentas: CUENTAS,
  miTurno: { id: 't-1', caja: { id: 'caja-1', nombre: 'Caja 1' } },
  puedeGestionar: false,
  ...cambios,
});

const gastoFalso = (cambios: Partial<Gasto> = {}): Gasto => ({
  id: 'g-1',
  tipo: 'operativo',
  categoria: { id: 'cat-1', nombre: 'Transporte' },
  descripcion: 'Taxi al banco',
  cuenta: {
    id: 'c-1',
    nombre: 'Efectivo Caja 1',
    moneda: 'COP',
    sucursal: { id: 's-1', nombre: 'Cúcuta' },
  },
  monto: '25000.00',
  turno: { id: 't-1', caja: { id: 'caja-1', nombre: 'Caja 1' } },
  creadoPor: { id: 'u-1', nombre: 'Persona vendedor' },
  creadoEn: '2026-10-22T15:00:00.000Z',
  anulado: null,
  ...cambios,
});

describe('cuentasParaPagar', () => {
  it('quien no administra solo paga con el efectivo de la caja de su turno', () => {
    expect(cuentasParaPagar(CUENTAS, 'caja-1', false).map((c) => c.id)).toEqual(['c-1']);
    expect(cuentasParaPagar(CUENTAS, null, false)).toEqual([]);
  });

  it('el administrador paga desde cualquier cuenta', () => {
    expect(cuentasParaPagar(CUENTAS, null, true)).toHaveLength(4);
  });
});

describe('registrar un gasto', () => {
  it('el vendedor registra un gasto con categoría, descripción y clave de idempotencia', async () => {
    const { api, usuario } = await abrir('vendedor');

    await usuario.click(await screen.findByRole('button', { name: 'Nuevo gasto' }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nuevo gasto' }));
    await usuario.selectOptions(await dialogo.findByLabelText('Categoría'), 'cat-2');
    await usuario.type(dialogo.getByLabelText('Descripción'), 'Resma de papel');
    await usuario.type(dialogo.getByLabelText(/^Monto/), '12.500,50');
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar gasto' }));

    await waitFor(() => expect(api.de('POST', '/gastos')).toHaveLength(1));
    expect(api.de('POST', '/gastos')[0]?.cuerpo).toEqual({
      claveIdempotencia: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
      tipo: 'operativo',
      categoriaId: 'cat-2',
      descripcion: 'Resma de papel',
      cuentaId: 'c-1',
      monto: '12500.50',
    });
  });

  it('el vendedor no puede elegir "retiro del dueño"', async () => {
    const { usuario } = await abrir('vendedor');

    await usuario.click(await screen.findByRole('button', { name: 'Nuevo gasto' }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nuevo gasto' }));
    await dialogo.findByLabelText('Categoría');
    expect(dialogo.queryByLabelText('Qué es')).toBeNull();
  });

  it('el administrador registra un retiro del dueño sin categoría', async () => {
    const { api, usuario } = await abrir('administrador', opciones({ puedeGestionar: true }));

    await usuario.click(await screen.findByRole('button', { name: 'Nuevo gasto' }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nuevo gasto' }));
    await usuario.selectOptions(await dialogo.findByLabelText('Qué es'), 'retiro_dueno');
    expect(dialogo.queryByLabelText('Categoría')).toBeNull();
    await usuario.type(dialogo.getByLabelText('Descripción'), 'Retiro de utilidades');
    await usuario.selectOptions(dialogo.getByLabelText('Se paga con'), 'c-3');
    await usuario.type(dialogo.getByLabelText(/^Monto/), '1000000');
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar retiro' }));

    await waitFor(() => expect(api.de('POST', '/gastos')).toHaveLength(1));
    expect(api.de('POST', '/gastos')[0]?.cuerpo).toEqual({
      claveIdempotencia: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
      tipo: 'retiro_dueno',
      descripcion: 'Retiro de utilidades',
      cuentaId: 'c-3',
      monto: '1000000',
    });
  });

  it('sin turno abierto el vendedor recibe el aviso y no ve el formulario', async () => {
    const { usuario } = await abrir('vendedor', opciones({ miTurno: null }));

    await usuario.click(await screen.findByRole('button', { name: 'Nuevo gasto' }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nuevo gasto' }));
    expect(await dialogo.findByText(/Abre tu turno de caja/)).toBeInTheDocument();
    expect(dialogo.queryByLabelText('Descripción')).toBeNull();
  });

  it('un rechazo del servidor se muestra dentro del cuadro y conserva lo escrito', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /gastos/opciones': { cuerpo: opciones() },
      'POST /gastos': errorApi(
        409,
        'ESTADO_INVALIDO',
        'Los montos en COP no admiten ese número de decimales.',
      ),
    });
    const { usuario } = renderizarApp('/gastos');
    await usuario.click(await screen.findByRole('button', { name: 'Nuevo gasto' }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Nuevo gasto' }));
    await usuario.type(await dialogo.findByLabelText('Descripción'), 'Taxi');
    await usuario.type(dialogo.getByLabelText(/^Monto/), '1000.555');
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar gasto' }));

    expect(await dialogo.findByText(/no admiten ese número de decimales/)).toBeInTheDocument();
    expect(dialogo.getByLabelText('Descripción')).toHaveValue('Taxi');
  });
});

describe('historial y anulación', () => {
  it('el vendedor no ve el historial, solo el formulario', async () => {
    await abrir('vendedor');

    expect(await screen.findByRole('button', { name: 'Nuevo gasto' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('el administrador ve el historial, filtra por tipo y anula con motivo', async () => {
    const { api, usuario } = await abrir('administrador', opciones({ puedeGestionar: true }), [
      gastoFalso(),
      gastoFalso({
        id: 'g-2',
        descripcion: 'Almuerzo',
        anulado: {
          por: { id: 'u-0', nombre: 'Admin' },
          en: '2026-10-22T16:00:00.000Z',
          motivo: 'Se registró dos veces',
        },
      }),
    ]);

    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText('Taxi al banco')).toBeInTheDocument();
    expect(within(tabla).getByText('Se registró dos veces')).toBeInTheDocument();
    // Solo el vigente ofrece anular.
    expect(within(tabla).getAllByRole('button', { name: /^Anular/ })).toHaveLength(1);

    await usuario.selectOptions(screen.getByLabelText('Tipo'), 'retiro_dueno');
    await waitFor(() =>
      expect(api.de('GET', '/gastos').at(-1)?.consulta.get('tipo')).toBe('retiro_dueno'),
    );

    // Al cambiar el filtro la lista se vuelve a cargar: la tabla es otra.
    const tablaFiltrada = await screen.findByRole('table');
    await usuario.click(within(tablaFiltrada).getByRole('button', { name: /^Anular/ }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Anular el gasto' }));
    const confirmar = dialogo.getByRole('button', { name: 'Anular gasto' });
    expect(confirmar).toBeDisabled();
    await usuario.type(dialogo.getByLabelText('Motivo'), 'Se registró en la cuenta equivocada');
    await usuario.click(confirmar);

    await waitFor(() => expect(api.de('POST', '/gastos/g-1/anular')).toHaveLength(1));
    expect(api.de('POST', '/gastos/g-1/anular')[0]?.cuerpo).toEqual({
      motivo: 'Se registró en la cuenta equivocada',
    });
  });
});

async function abrir(
  rol: 'vendedor' | 'administrador',
  opcionesServidor: OpcionesGasto = opciones(),
  gastos: Gasto[] = [],
) {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa(rol) },
    'GET /gastos/opciones': { cuerpo: opcionesServidor },
    'GET /gastos': { cuerpo: { gastos } },
    'POST /gastos': { cuerpo: { gasto: gastoFalso() } },
    'POST /gastos/g-1/anular': { cuerpo: { gasto: gastoFalso() } },
  });
  const { usuario } = renderizarApp('/gastos');
  await screen.findByRole('heading', { name: 'Gastos' });
  return { api, usuario };
}
