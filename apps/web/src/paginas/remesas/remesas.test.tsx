import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Cliente, ClienteConMedios, MedioPago } from '../../modulos/clientes/tipos.js';
import type { OpcionesRemesa, Remesa } from '../../modulos/remesas/tipos.js';
import { errorApi, sesionFalsa, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

const remesaFalsa = (cambios: Partial<Remesa> = {}): Remesa => ({
  id: 'r-1',
  numeroComprobante: 128,
  codigoSeguimiento: '7K3M9XQ4TB2D',
  estado: 'en_cola',
  formaPago: 'efectivo',
  lineaNegocio: { id: 'l-1', nombre: 'Transferencias a Venezuela' },
  remitente: { id: 'c-1', tipoDocumento: 'CC', numeroDocumento: '1090123456', nombre: 'Ana Gómez' },
  beneficiario: {
    cliente: {
      id: 'c-2',
      tipoDocumento: 'V',
      numeroDocumento: '12345678',
      nombre: 'Pedro Titular',
    },
    medioPagoId: 'm-1',
    tipo: 'cuenta_bancaria',
    banco: { codigo: '0102', nombre: 'Banco de Venezuela' },
    numeroCuenta: '01020000000000000001',
    telefonoPagoMovil: null,
    titular: 'Pedro Titular',
    tipoDocumentoTitular: 'V',
    numeroDocumentoTitular: '12345678',
  },
  cuentaIngreso: { id: 'cu-1', nombre: 'Caja principal' },
  montoPesos: '162000.00',
  montoBolivares: '43085.106',
  tasaCalculada: '3.760000',
  tasaUsada: '3.760000',
  motivoTasa: null,
  pago: {
    operador: null,
    tomadaEn: null,
    cuentaOrigen: null,
    referenciaBancaria: null,
    costoBancario: null,
    tieneComprobante: false,
    completadaEn: null,
  },
  creadoPor: { id: 'id-vendedor', nombre: 'Laura Pérez' },
  creadoEn: '2026-10-13T19:05:00.000Z',
  ...cambios,
});

const OPCIONES: OpcionesRemesa = {
  lineas: [
    {
      id: 'l-1',
      nombre: 'Transferencias a Venezuela',
      monedaOrigen: 'COP',
      monedaDestino: 'VES',
      tasaVenta: '3.760000',
    },
  ],
  cuentasIngreso: [
    { id: 'cu-1', nombre: 'Caja principal', tipo: 'caja', moneda: 'COP' },
    { id: 'cu-2', nombre: 'Bancolombia', tipo: 'banco', moneda: 'COP' },
  ],
};

const clienteFalso = (cambios: Partial<Cliente> = {}): Cliente => ({
  id: 'c-1',
  tipoDocumento: 'CC',
  numeroDocumento: '1090123456',
  nombre: 'Ana Gómez',
  telefono: null,
  activo: true,
  creadoEn: '2026-10-01T00:00:00.000Z',
  ...cambios,
});

const medioFalso: MedioPago = {
  id: 'm-1',
  tipo: 'cuenta_bancaria',
  banco: { id: 'b-1', codigo: '0102', nombre: 'Banco de Venezuela' },
  numeroCuenta: '01020000000000000001',
  telefonoPagoMovil: null,
  titular: 'Pedro Titular',
  tipoDocumentoTitular: 'V',
  numeroDocumentoTitular: '12345678',
  activo: true,
  creadoEn: '2026-10-01T00:00:00.000Z',
};

const beneficiarioConMedios: ClienteConMedios = {
  ...clienteFalso({
    id: 'c-2',
    tipoDocumento: 'V',
    numeroDocumento: '12345678',
    nombre: 'Pedro Titular',
  }),
  mediosPago: [medioFalso],
};

describe('lista de remesas', () => {
  it('muestra el número, los montos con su moneda y el estado', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /remesas': { cuerpo: { remesas: [remesaFalsa()] } },
    });

    renderizarApp('/remesas');

    const tabla = await screen.findByRole('table');
    const fila = within(tabla).getByText('Ana Gómez').closest('tr');
    expect(fila).not.toBeNull();
    const celdas = within(fila as HTMLElement);
    expect(celdas.getByText('128')).toBeInTheDocument();
    expect(celdas.getByText('COP 162.000')).toBeInTheDocument();
    expect(celdas.getByText('VES 43.085,106')).toBeInTheDocument();
    expect(celdas.getByText('En cola')).toBeInTheDocument();
  });

  it('filtra por estado pidiéndolo a la API', async () => {
    const api = simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /remesas': (peticion) => ({
        cuerpo: {
          remesas:
            peticion.consulta.get('estado') === 'con_incidencia'
              ? [remesaFalsa({ id: 'r-9', numeroComprobante: 200, estado: 'con_incidencia' })]
              : [remesaFalsa()],
        },
      }),
    });
    const { usuario } = renderizarApp('/remesas');
    await screen.findByText('128');

    await usuario.selectOptions(screen.getByLabelText('Estado'), 'con_incidencia');

    expect(await screen.findByText('200')).toBeInTheDocument();
    expect(api.de('GET', '/remesas').at(-1)?.consulta.get('estado')).toBe('con_incidencia');
  });

  it('sin remesas explica cómo empezar', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /remesas': { cuerpo: { remesas: [] } },
    });

    renderizarApp('/remesas');

    expect(await screen.findByText('Todavía no hay remesas')).toBeInTheDocument();
  });

  it('el digitador no entra: no tiene permiso', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('digitador') },
      'GET /cola': {
        cuerpo: { remesas: [], cuentasOrigen: [], ultimaCuentaOrigenId: null },
      },
    });

    renderizarApp('/remesas');

    expect(await screen.findByText(/no tienes permiso/i)).toBeInTheDocument();
  });
});

describe('detalle y acciones', () => {
  const abrirDetalle = async (rol: 'vendedor' | 'administrador', remesa: Remesa) => {
    const api = simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa(rol) },
      'GET /remesas': { cuerpo: { remesas: [remesa] } },
      [`GET /remesas/${remesa.id}/historial`]: {
        cuerpo: {
          historial: [
            {
              estadoAnterior: null,
              estadoNuevo: 'registrada',
              motivo: null,
              usuario: { id: 'u', nombre: 'Laura Pérez' },
              creadoEn: '2026-10-13T19:05:00.000Z',
            },
          ],
        },
      },
      [`POST /remesas/${remesa.id}/verificar-pago`]: {
        cuerpo: { remesa: { ...remesa, estado: 'en_cola' } },
      },
      [`POST /remesas/${remesa.id}/anular`]: {
        cuerpo: { remesa: { ...remesa, estado: 'anulada' } },
      },
    });
    const pantalla = renderizarApp('/remesas');
    await pantalla.usuario.click(await screen.findByRole('button', { name: /Abrir remesa 128/ }));
    return { api, ...pantalla };
  };

  it('verificar el pago de una remesa registrada llama a la API', async () => {
    const { api, usuario } = await abrirDetalle('vendedor', remesaFalsa({ estado: 'registrada' }));

    await usuario.click(await screen.findByRole('button', { name: 'Verificar pago recibido' }));

    await waitFor(() => expect(api.de('POST', '/remesas/r-1/verificar-pago')).toHaveLength(1));
  });

  it('el vendedor no ve el botón de anular; el administrador sí, y pide motivo', async () => {
    const vendedor = await abrirDetalle('vendedor', remesaFalsa());
    await screen.findByRole('heading', { name: /Comprobante N° 128/ });
    expect(screen.queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument();
    vendedor.unmount();
    vi.unstubAllGlobals();

    const { api, usuario } = await abrirDetalle('administrador', remesaFalsa());
    await usuario.click(await screen.findByRole('button', { name: 'Anular' }));
    const confirmar = screen.getByRole('button', { name: 'Anular remesa' });
    expect(confirmar).toBeDisabled();
    await usuario.type(screen.getByLabelText('Motivo'), 'Error del vendedor');
    await usuario.click(confirmar);

    await waitFor(() => expect(api.de('POST', '/remesas/r-1/anular')).toHaveLength(1));
    expect(api.de('POST', '/remesas/r-1/anular')[0]?.cuerpo).toEqual({
      motivo: 'Error del vendedor',
    });
  });

  it('muestra el historial, el código de seguimiento y la captura cuando existe', async () => {
    await abrirDetalle(
      'vendedor',
      remesaFalsa({
        estado: 'completada',
        pago: {
          operador: { id: 'd', nombre: 'Digitador Uno' },
          tomadaEn: null,
          cuentaOrigen: { id: 'cu', nombre: 'Banesco' },
          referenciaBancaria: 'REF123',
          costoBancario: '1.500',
          tieneComprobante: true,
          completadaEn: null,
        },
      }),
    );

    expect(await screen.findByText('7K3M9XQ4TB2D')).toBeInTheDocument();
    expect(screen.getByText('REF123')).toBeInTheDocument();
    expect(screen.getByText('Digitador Uno')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Captura del comprobante/ })).toHaveAttribute(
      'src',
      '/api/remesas/r-1/comprobante',
    );
    const detalle = within(screen.getByRole('dialog', { name: 'Remesa' }));
    // El historial aparece cuando llega: su primer paso es "Por verificar pago".
    expect(await detalle.findByRole('list')).toHaveTextContent('Por verificar pago');
  });
});

describe('nueva remesa', () => {
  it('registra con la clave de idempotencia, calcula la vista previa y ofrece el recibo', async () => {
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const creada = remesaFalsa();
    const api = simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /remesas': { cuerpo: { remesas: [] } },
      'GET /remesas/opciones': { cuerpo: OPCIONES },
      'GET /clientes': (peticion) => ({
        cuerpo: {
          clientes:
            peticion.consulta.get('busqueda') === 'Ana'
              ? [clienteFalso()]
              : [clienteFalso({ id: 'c-2', nombre: 'Pedro Titular', numeroDocumento: '12345678' })],
        },
      }),
      'GET /clientes/c-2': { cuerpo: { cliente: beneficiarioConMedios } },
      'GET /clientes/bancos': { cuerpo: { bancos: [] } },
      'POST /remesas': { estado: 201, cuerpo: { remesa: creada } },
      'POST /remesas/r-1/recibo': {
        cuerpo: {
          recibo: {
            esCopia: false,
            numeroCopia: 0,
            numeroComprobante: 128,
            codigoSeguimiento: '7K3M9XQ4TB2D',
            urlSeguimiento: 'http://localhost/seguimiento/7K3M9XQ4TB2D',
            fecha: '2026-10-13T19:05:00.000Z',
            fechaTexto: '13/10/2026 14:05',
            empresa: {
              nombre: 'Casa de Cambio Ejemplo',
              nit: null,
              telefono: null,
              whatsapp: null,
              direccion: null,
              tieneLogo: false,
              textoPie: null,
              zonaHoraria: 'America/Bogota',
            },
            remitente: { nombre: 'Ana Gómez', tipoDocumento: 'CC', numeroDocumento: '1090123456' },
            beneficiario: {
              titular: 'Pedro Titular',
              tipoDocumento: 'V',
              numeroDocumento: '12345678',
              tipoPago: 'cuenta_bancaria',
              banco: { codigo: '0102', nombre: 'Banco de Venezuela' },
              numeroCuenta: '01020000000000000001',
              telefonoPagoMovil: null,
            },
            montoPesosTexto: 'COP 162.000',
            montoBolivaresTexto: 'VES 43.085,106',
            vendedor: 'Laura Pérez',
            texto: 'Recibo',
          },
        },
      },
    });
    const { usuario } = renderizarApp('/remesas');

    await usuario.click(await screen.findByRole('button', { name: 'Nueva remesa' }));
    const buscarRemitente = await screen.findByLabelText('Remitente');
    await usuario.type(buscarRemitente, 'Ana');
    await usuario.click(await screen.findByRole('button', { name: /Ana Gómez/ }));

    await usuario.type(screen.getByLabelText('Beneficiario'), 'Pedro');
    await usuario.click(await screen.findByRole('button', { name: /Pedro Titular/ }));
    await usuario.click(await screen.findByRole('radio'));

    await usuario.type(screen.getByLabelText('Pesos entregados (COP)'), '162000');
    expect(await screen.findByText('VES 43.085,106')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Registrar remesa' }));

    await waitFor(() => expect(api.de('POST', '/remesas')).toHaveLength(1));
    const cuerpo = api.de('POST', '/remesas')[0]?.cuerpo as Record<string, unknown>;
    expect(cuerpo).toMatchObject({
      lineaNegocioId: 'l-1',
      remitenteId: 'c-1',
      medioPagoId: 'm-1',
      formaPago: 'efectivo',
      cuentaIngresoId: 'cu-1',
      montoPesos: '162000',
    });
    expect(cuerpo.claveIdempotencia).toEqual(expect.any(String));
    // No manda la tasa: el servidor usa la vigente.
    expect(cuerpo).not.toHaveProperty('tasaUsada');
    expect(cuerpo).not.toHaveProperty('tasaManual');

    await usuario.click(await screen.findByRole('button', { name: 'Emitir e imprimir' }));
    expect(await screen.findByRole('article', { name: 'Recibo 128' })).toBeInTheDocument();
    await waitFor(() => expect(imprimir).toHaveBeenCalled());
  });

  it('un monto ambiguo como 162.000 no se envía: pide aclararlo', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /remesas': { cuerpo: { remesas: [] } },
      'GET /remesas/opciones': { cuerpo: OPCIONES },
      'GET /clientes/bancos': { cuerpo: { bancos: [] } },
    });
    const { usuario } = renderizarApp('/remesas');
    await usuario.click(await screen.findByRole('button', { name: 'Nueva remesa' }));

    await usuario.type(await screen.findByLabelText('Pesos entregados (COP)'), '162.000');

    expect(await screen.findByText(/No queda claro si es 162000/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar remesa' })).toBeDisabled();
  });

  it('solo quien tiene permiso puede usar otra tasa', async () => {
    const respuestas = (rol: 'vendedor' | 'administrador') => ({
      'GET /auth/yo': { cuerpo: sesionFalsa(rol) },
      'GET /remesas': { cuerpo: { remesas: [] } },
      'GET /remesas/opciones': { cuerpo: OPCIONES },
      'GET /clientes/bancos': { cuerpo: { bancos: [] } },
    });
    simularApi(respuestas('vendedor'));
    const vendedor = renderizarApp('/remesas');
    await vendedor.usuario.click(await screen.findByRole('button', { name: 'Nueva remesa' }));
    await screen.findByLabelText('Pesos entregados (COP)');
    expect(screen.queryByLabelText('Usar otra tasa en esta remesa')).not.toBeInTheDocument();
    vendedor.unmount();

    simularApi(respuestas('administrador'));
    const admin = renderizarApp('/remesas');
    await admin.usuario.click(await screen.findByRole('button', { name: 'Nueva remesa' }));

    expect(await screen.findByLabelText('Usar otra tasa en esta remesa')).toBeInTheDocument();
  });

  it('sin línea de remesas activa lo explica', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /remesas': { cuerpo: { remesas: [] } },
      'GET /remesas/opciones': { cuerpo: { lineas: [], cuentasIngreso: [] } },
    });
    const { usuario } = renderizarApp('/remesas');

    await usuario.click(await screen.findByRole('button', { name: 'Nueva remesa' }));

    expect(await screen.findByText(/No hay una línea de remesas activa/)).toBeInTheDocument();
  });

  it('muestra el error del servidor si no se pudo registrar', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /remesas': { cuerpo: { remesas: [] } },
      'GET /remesas/opciones': { cuerpo: OPCIONES },
      'GET /clientes': { cuerpo: { clientes: [clienteFalso()] } },
      'GET /clientes/c-1': { cuerpo: { cliente: { ...clienteFalso(), mediosPago: [medioFalso] } } },
      'GET /clientes/bancos': { cuerpo: { bancos: [] } },
      'POST /remesas': errorApi(409, 'ESTADO_INVALIDO', 'No hay una tasa vigente para esta línea.'),
    });
    const { usuario } = renderizarApp('/remesas');
    await usuario.click(await screen.findByRole('button', { name: 'Nueva remesa' }));
    await usuario.type(await screen.findByLabelText('Remitente'), 'Ana');
    await usuario.click(await screen.findByRole('button', { name: /Ana Gómez/ }));
    await usuario.type(screen.getByLabelText('Beneficiario'), 'Ana');
    await usuario.click(await screen.findByRole('button', { name: /Ana Gómez/ }));
    await usuario.click(await screen.findByRole('radio'));
    await usuario.type(screen.getByLabelText('Pesos entregados (COP)'), '50000');

    await usuario.click(screen.getByRole('button', { name: 'Registrar remesa' }));

    expect(await screen.findByText('No hay una tasa vigente para esta línea.')).toBeInTheDocument();
  });
});
