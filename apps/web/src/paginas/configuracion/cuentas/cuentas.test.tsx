import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CuentaDinero } from '../../../modulos/cuentas-dinero/tipos.js';
import {
  errorApi,
  sesionFalsa,
  simularApi,
  type PeticionFalsa,
  type RespuestaFalsa,
} from '../../../pruebas/api-falsa.js';
import { renderizarApp } from '../../../pruebas/renderizar.js';

const cuentaFalsa = (cambios: Partial<CuentaDinero> = {}): CuentaDinero => ({
  id: 'cu-1',
  nombre: 'Caja principal',
  tipo: 'caja',
  moneda: 'COP',
  bancoId: null,
  bancoNombre: null,
  ultimos4Digitos: null,
  sucursalId: 's-1',
  sucursalNombre: 'Principal',
  titular: null,
  contraparteTitularId: null,
  contraparteTitularNombre: null,
  responsableId: null,
  responsableNombre: null,
  activa: true,
  limiteDiario: null,
  comisionPorDefecto: null,
  ...cambios,
});

const SUCURSALES = { sucursales: [{ id: 's-1', nombre: 'Principal', ciudad: 'Cúcuta' }] };
const BANCOS = {
  bancos: [
    {
      id: 'b-1',
      codigo: '0102',
      nombre: 'Banco de Venezuela',
      pais: 'VE',
      activo: true,
      creadoEn: '2026-03-10T15:00:00.000Z',
    },
  ],
};
const USUARIOS = {
  usuarios: [
    {
      id: 'u-1',
      nombre: 'Ana Vendedora',
      login: 'ana',
      rol: 'vendedor',
      sucursalId: null,
      sucursalNombre: null,
      activo: true,
      tiene2fa: true,
      debeCambiarContrasena: false,
      bloqueadoHasta: null,
      ultimoAcceso: null,
      creadoEn: '2026-03-10T15:00:00.000Z',
    },
  ],
  total: 1,
  pagina: 1,
  porPagina: 100,
};

function abrirCuentas(
  cuentas: CuentaDinero[] = [cuentaFalsa()],
  extra: Record<string, RespuestaFalsa | ((peticion: PeticionFalsa) => RespuestaFalsa)> = {},
) {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /cuentas-dinero': { cuerpo: { cuentas } },
    'GET /sucursales': { cuerpo: SUCURSALES },
    'GET /bancos': { cuerpo: BANCOS },
    'GET /contrapartes/opciones': {
      cuerpo: {
        contrapartes: [{ id: 'cp-1', nombre: 'Sara Castro', tipo: 'proveedor' }],
        cuentas: [],
      },
    },
    'GET /usuarios': { cuerpo: USUARIOS },
    ...extra,
  });
  return { api, ...renderizarApp('/configuracion/cuentas') };
}

describe('pantalla de cuentas', () => {
  it('lista las cuentas con su tipo, moneda y sucursal', async () => {
    abrirCuentas();

    const tabla = await screen.findByRole('table');
    expect(tabla).toHaveTextContent('Caja principal');
    expect(tabla).toHaveTextContent('Caja');
    expect(tabla).toHaveTextContent('Principal');
  });

  it('una cuenta banco muestra el banco y los últimos 4 dígitos', async () => {
    abrirCuentas([
      cuentaFalsa({
        tipo: 'banco',
        bancoId: 'b-1',
        bancoNombre: 'Banco de Venezuela',
        ultimos4Digitos: '4441',
      }),
    ]);

    expect(await screen.findByRole('table')).toHaveTextContent('Banco de Venezuela ····4441');
  });

  it('crea una cuenta tipo caja (sin pedir banco)', async () => {
    const { usuario } = abrirCuentas([], {
      'POST /cuentas-dinero': () => ({
        estado: 201,
        cuerpo: { cuenta: cuentaFalsa({ id: 'cu-2' }) },
      }),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Nueva cuenta' }));
    const dialogo = await screen.findByRole('dialog');
    await usuario.type(within(dialogo).getByLabelText('Nombre'), 'Caja principal');
    await waitFor(() => expect(within(dialogo).getByLabelText('Sucursal')).not.toBeDisabled());
    await usuario.selectOptions(within(dialogo).getByLabelText('Sucursal'), 'Principal · Cúcuta');
    expect(within(dialogo).queryByLabelText('Banco')).not.toBeInTheDocument();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Se creó la cuenta.')).toBeInTheDocument();
  });

  it('la cuenta puede quedar a nombre de una contraparte (§5.9)', async () => {
    const { api, usuario } = abrirCuentas([], {
      'POST /cuentas-dinero': () => ({
        estado: 201,
        cuerpo: { cuenta: cuentaFalsa({ id: 'cu-3' }) },
      }),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Nueva cuenta' }));
    const dialogo = await screen.findByRole('dialog');
    await usuario.type(within(dialogo).getByLabelText('Nombre'), 'VZLA Sara Castro');
    await waitFor(() => expect(within(dialogo).getByLabelText('Sucursal')).not.toBeDisabled());
    await usuario.selectOptions(within(dialogo).getByLabelText('Sucursal'), 'Principal · Cúcuta');
    await usuario.selectOptions(
      await within(dialogo).findByLabelText('Contraparte titular'),
      'Sara Castro',
    );
    await usuario.click(within(dialogo).getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => expect(api.de('POST', '/cuentas-dinero')).toHaveLength(1));
    expect(api.de('POST', '/cuentas-dinero')[0]?.cuerpo).toMatchObject({
      contraparteTitularId: 'cp-1',
    });
  });

  it('crea una cuenta tipo banco pidiendo banco y últimos 4 dígitos', async () => {
    const { usuario } = abrirCuentas([], {
      'POST /cuentas-dinero': () => ({
        estado: 201,
        cuerpo: { cuenta: cuentaFalsa({ id: 'cu-3', tipo: 'banco' }) },
      }),
    });
    await usuario.click(await screen.findByRole('button', { name: 'Nueva cuenta' }));
    const dialogo = await screen.findByRole('dialog');
    await usuario.type(within(dialogo).getByLabelText('Nombre'), 'VZLA cuenta');
    await usuario.selectOptions(within(dialogo).getByLabelText('Tipo'), 'Cuenta bancaria');
    await waitFor(() => expect(within(dialogo).getByLabelText('Sucursal')).not.toBeDisabled());
    await usuario.selectOptions(within(dialogo).getByLabelText('Sucursal'), 'Principal · Cúcuta');
    await waitFor(() => expect(within(dialogo).getByLabelText('Banco')).not.toBeDisabled());
    await usuario.selectOptions(
      within(dialogo).getByLabelText('Banco'),
      '0102 · Banco de Venezuela',
    );
    await usuario.type(within(dialogo).getByLabelText('Últimos 4 dígitos'), '4441');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Se creó la cuenta.')).toBeInTheDocument();
  });

  it('editar una cuenta banco solo pide datos editables (no tipo, moneda ni sucursal)', async () => {
    const { api, usuario } = abrirCuentas(
      [
        cuentaFalsa({
          tipo: 'banco',
          bancoId: 'b-1',
          bancoNombre: 'Banco de Venezuela',
          ultimos4Digitos: '4441',
        }),
      ],
      {
        'PATCH /cuentas-dinero/cu-1': () => ({
          cuerpo: { cuenta: cuentaFalsa({ comisionPorDefecto: '5000.00' }) },
        }),
      },
    );
    await usuario.click(await screen.findByRole('button', { name: /Editar/ }));
    const dialogo = await screen.findByRole('dialog');

    expect(within(dialogo).queryByLabelText('Tipo')).not.toBeInTheDocument();
    expect(within(dialogo).queryByLabelText('Sucursal')).not.toBeInTheDocument();
    expect(within(dialogo).getByLabelText('Últimos 4 dígitos')).toHaveValue('4441');
    await usuario.type(within(dialogo).getByLabelText('Comisión por defecto'), '5000');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(api.de('PATCH', '/cuentas-dinero/cu-1')).toHaveLength(1));
    expect(api.de('PATCH', '/cuentas-dinero/cu-1')[0]?.cuerpo).toEqual({
      comisionPorDefecto: '5000',
    });
  });

  it('desactivar pide confirmación', async () => {
    const { usuario } = abrirCuentas([cuentaFalsa()], {
      'POST /cuentas-dinero/cu-1/desactivar': {
        cuerpo: { cuenta: cuentaFalsa({ activa: false }) },
      },
    });
    await usuario.click(await screen.findByRole('button', { name: /Desactivar/ }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('¿Desactivar cuenta?');

    await usuario.click(screen.getByRole('button', { name: 'Sí, desactivar' }));

    expect(await screen.findByText('Caja principal fue desactivada.')).toBeInTheDocument();
  });

  it('un vendedor no puede entrar', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') } });
    renderizarApp('/configuracion/cuentas');

    expect(await screen.findByRole('heading', { name: 'Sin acceso' })).toBeInTheDocument();
  });

  it('si la lista falla, lo dice', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
      'GET /cuentas-dinero': errorApi(500, 'ERROR_INTERNO', 'Ocurrió un error.'),
      'GET /sucursales': { cuerpo: SUCURSALES },
      'GET /bancos': { cuerpo: BANCOS },
      'GET /contrapartes/opciones': {
        cuerpo: {
          contrapartes: [{ id: 'cp-1', nombre: 'Sara Castro', tipo: 'proveedor' }],
          cuentas: [],
        },
      },
      'GET /usuarios': { cuerpo: USUARIOS },
    });
    renderizarApp('/configuracion/cuentas');

    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error.');
  });
});
