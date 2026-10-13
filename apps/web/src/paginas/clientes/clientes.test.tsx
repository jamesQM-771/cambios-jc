import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Cliente, ClienteConMedios } from '../../modulos/clientes/tipos.js';
import { errorApi, sesionFalsa, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

const cliente = (cambios: Partial<Cliente> = {}): Cliente => ({
  id: 'c-1',
  tipoDocumento: 'V',
  numeroDocumento: '12345678',
  nombre: 'María Pérez',
  telefono: '+573001234567',
  activo: true,
  creadoEn: '2026-10-01T00:00:00.000Z',
  ...cambios,
});

const conMedios = (base: Cliente): ClienteConMedios => ({
  ...base,
  mediosPago: [
    {
      id: 'm-1',
      tipo: 'cuenta_bancaria',
      banco: { id: 'b-1', codigo: '0102', nombre: 'Banco de Venezuela' },
      numeroCuenta: '01020000000000000001',
      telefonoPagoMovil: null,
      titular: 'María Pérez',
      tipoDocumentoTitular: 'V',
      numeroDocumentoTitular: '12345678',
      activo: true,
      creadoEn: '2026-10-01T00:00:00.000Z',
    },
  ],
});

describe('clientes', () => {
  it('lista los clientes con su documento y teléfono', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /clientes': { cuerpo: { clientes: [cliente()] } },
    });

    renderizarApp('/clientes');

    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText('María Pérez')).toBeInTheDocument();
    expect(within(tabla).getByText('V 12345678')).toBeInTheDocument();
    expect(within(tabla).getByText('+57 300 123 4567')).toBeInTheDocument();
  });

  it('busca por documento pidiéndolo a la API cuando se deja de escribir', async () => {
    const api = simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /clientes': { cuerpo: { clientes: [cliente()] } },
    });
    const { usuario } = renderizarApp('/clientes');
    await screen.findByRole('table');

    await usuario.type(screen.getByRole('searchbox', { name: 'Buscar cliente' }), '12345678');

    await waitFor(() =>
      expect(api.de('GET', '/clientes').at(-1)?.consulta.get('busqueda')).toBe('12345678'),
    );
  });

  it('registra un cliente nuevo y abre su ficha', async () => {
    const nuevo = cliente({ id: 'c-9', nombre: 'Luis Gómez', numeroDocumento: '87654321' });
    const api = simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /clientes': { cuerpo: { clientes: [] } },
      'POST /clientes': { estado: 201, cuerpo: { cliente: { ...nuevo, mediosPago: [] } } },
      'GET /clientes/c-9': { cuerpo: { cliente: { ...nuevo, mediosPago: [] } } },
      'GET /clientes/bancos': { cuerpo: { bancos: [] } },
    });
    const { usuario } = renderizarApp('/clientes');

    await usuario.click(await screen.findByRole('button', { name: 'Nuevo cliente' }));
    await usuario.type(screen.getByLabelText('Número de documento'), '87654321');
    await usuario.type(screen.getByLabelText('Nombre completo'), 'Luis Gómez');
    await usuario.click(screen.getByRole('button', { name: 'Registrar cliente' }));

    await waitFor(() => expect(api.de('POST', '/clientes')).toHaveLength(1));
    expect(api.de('POST', '/clientes')[0]?.cuerpo).toEqual({
      tipoDocumento: 'V',
      numeroDocumento: '87654321',
      nombre: 'Luis Gómez',
    });
    expect(
      await screen.findByText('Todavía no tiene cuentas ni pagos móviles registrados.'),
    ).toBeInTheDocument();
  });

  it('muestra el error de un documento repetido junto al campo', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /clientes': { cuerpo: { clientes: [] } },
      'POST /clientes': errorApi(
        409,
        'VALOR_EN_USO',
        'Ya existe un cliente con ese tipo y número de documento.',
        [{ campo: 'numeroDocumento', mensaje: 'Ya está en uso.' }],
      ),
    });
    const { usuario } = renderizarApp('/clientes');
    await usuario.click(await screen.findByRole('button', { name: 'Nuevo cliente' }));
    await usuario.type(screen.getByLabelText('Número de documento'), '12345678');
    await usuario.type(screen.getByLabelText('Nombre completo'), 'María Pérez');

    await usuario.click(screen.getByRole('button', { name: 'Registrar cliente' }));

    expect(await screen.findByText('Ya está en uso.')).toBeInTheDocument();
  });

  it('en la ficha muestra la cuenta con su formato y permite agregar otra', async () => {
    const base = cliente();
    const api = simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /clientes': { cuerpo: { clientes: [base] } },
      'GET /clientes/c-1': { cuerpo: { cliente: conMedios(base) } },
      'GET /clientes/bancos': {
        cuerpo: { bancos: [{ id: 'b-1', codigo: '0102', nombre: 'Banco de Venezuela' }] },
      },
      'POST /clientes/c-1/medios-pago': {
        estado: 201,
        cuerpo: { medioPago: conMedios(base).mediosPago[0] },
      },
    });
    const { usuario } = renderizarApp('/clientes');
    await usuario.click(await screen.findByRole('button', { name: 'Abrir María Pérez' }));

    expect(await screen.findByText('0102 0000 0000 0000 0001')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Agregar cuenta o pago móvil' }));
    await usuario.type(await screen.findByLabelText('Número de cuenta'), '01020000000000000002');
    await usuario.type(screen.getByLabelText('Número del documento'), '12345678');
    await usuario.click(screen.getByRole('button', { name: 'Guardar datos de pago' }));

    await waitFor(() => expect(api.de('POST', '/clientes/c-1/medios-pago')).toHaveLength(1));
    expect(api.de('POST', '/clientes/c-1/medios-pago')[0]?.cuerpo).toMatchObject({
      tipo: 'cuenta_bancaria',
      bancoId: 'b-1',
      numeroCuenta: '01020000000000000002',
      titular: 'María Pérez',
      tipoDocumentoTitular: 'V',
      numeroDocumentoTitular: '12345678',
    });
  });

  it('el digitador no ve clientes', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('digitador') },
      'GET /cola': { cuerpo: { remesas: [], cuentasOrigen: [], ultimaCuentaOrigenId: null } },
    });

    renderizarApp('/clientes');

    expect(await screen.findByText(/no tienes permiso/i)).toBeInTheDocument();
  });
});
