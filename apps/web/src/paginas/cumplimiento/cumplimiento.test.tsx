import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Alerta, CumplimientoCliente } from '../../modulos/cumplimiento/tipos.js';
import { sesionFalsa, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

const alertaFalsa = (cambios: Partial<Alerta> = {}): Alerta => ({
  id: 'al-1',
  tipo: 'fraccionamiento',
  estado: 'abierta',
  cliente: { id: 'cl-1', nombre: 'Ana Gómez', tipoDocumento: 'CC', numeroDocumento: '1234' },
  operacion: { id: 'op-1', numeroComprobante: 77 },
  detalle: { operaciones24h: 4, limite: 3 },
  justificacion: null,
  resueltaPor: null,
  resueltaEn: null,
  creadoEn: '2026-11-01T15:00:00.000Z',
  ...cambios,
});

function abrir() {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /cumplimiento/alertas': { cuerpo: { alertas: [alertaFalsa()] } },
    'POST /cumplimiento/alertas/al-1/descartar': {
      cuerpo: { alerta: alertaFalsa({ estado: 'descartada' }) },
    },
    'GET /cumplimiento/lista': { cuerpo: { entradas: [] } },
    'POST /cumplimiento/lista': {
      estado: 201,
      cuerpo: {
        entrada: {
          id: 'en-1',
          fuente: 'ofac',
          nombre: 'Persona Sancionada',
          numeroDocumento: null,
          nota: null,
          activa: true,
          creadoEn: '2026-11-01T15:00:00.000Z',
        },
      },
    },
    'GET /cumplimiento/parametros': {
      cuerpo: {
        parametros: {
          umbralFichaMensual: null,
          fraccionamientoCantidad: null,
          fraccionamientoMontoMaximo: null,
          concentracionRemitentes: null,
        },
      },
    },
    'PUT /cumplimiento/parametros': {
      cuerpo: {
        parametros: {
          umbralFichaMensual: '5000000.00',
          fraccionamientoCantidad: null,
          fraccionamientoMontoMaximo: null,
          concentracionRemitentes: null,
        },
      },
    },
  });
  return { api, ...renderizarApp('/cumplimiento') };
}

describe('pantalla de cumplimiento', () => {
  it('la bandeja muestra las alertas abiertas y se descartan con justificación', async () => {
    const { api, usuario } = abrir();
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText('Posible fraccionamiento')).toBeInTheDocument();
    expect(within(tabla).getByText('Remesa N° 77')).toBeInTheDocument();
    await usuario.click(within(tabla).getByRole('button', { name: /Revisar la alerta/ }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Revisar la alerta' }));
    const descartar = dialogo.getByRole('button', { name: 'Descartar' });
    expect(descartar).toBeDisabled();
    await usuario.type(dialogo.getByLabelText('Justificación'), 'Pagos de nómina del cliente');
    await usuario.click(descartar);
    await waitFor(() =>
      expect(api.de('POST', '/cumplimiento/alertas/al-1/descartar')).toHaveLength(1),
    );
    expect(api.de('POST', '/cumplimiento/alertas/al-1/descartar')[0]?.cuerpo).toEqual({
      justificacion: 'Pagos de nómina del cliente',
    });
  });

  it('agrega una persona a la lista restrictiva', async () => {
    const { api, usuario } = abrir();
    await usuario.click(await screen.findByRole('tab', { name: 'Lista restrictiva' }));
    await usuario.selectOptions(await screen.findByLabelText('Fuente'), 'ofac');
    await usuario.type(
      screen.getByLabelText('Nombre como aparece en la lista'),
      'Persona Sancionada',
    );
    await usuario.click(screen.getByRole('button', { name: 'Agregar a la lista' }));
    await waitFor(() => expect(api.de('POST', '/cumplimiento/lista')).toHaveLength(1));
    expect(api.de('POST', '/cumplimiento/lista')[0]?.cuerpo).toEqual({
      fuente: 'ofac',
      nombre: 'Persona Sancionada',
      numeroDocumento: null,
      nota: null,
    });
  });

  it('guarda los parámetros; un campo vacío apaga la regla', async () => {
    const { api, usuario } = abrir();
    await usuario.click(await screen.findByRole('tab', { name: 'Parámetros' }));
    await usuario.type(
      await screen.findByLabelText('Monto mensual (COP) que exige la ficha ampliada'),
      '5000000',
    );
    await usuario.click(screen.getByRole('button', { name: 'Guardar parámetros' }));
    await waitFor(() => expect(api.de('PUT', '/cumplimiento/parametros')).toHaveLength(1));
    expect(api.de('PUT', '/cumplimiento/parametros')[0]?.cuerpo).toEqual({
      umbralFichaMensual: '5000000',
      fraccionamientoCantidad: null,
      fraccionamientoMontoMaximo: null,
      concentracionRemitentes: null,
    });
  });

  it('el exporte es un enlace de descarga con las fechas', async () => {
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole('tab', { name: 'Exportar' }));
    const enlace = await screen.findByRole('link', { name: 'Descargar CSV' });
    expect(enlace.getAttribute('href')).toMatch(
      /^\/api\/cumplimiento\/exportes\/operaciones\?desde=\d{4}-\d{2}-\d{2}&hasta=/,
    );
  });

  it('el vendedor no entra', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') } });
    renderizarApp('/cumplimiento');
    expect(
      await screen.findByText('No tienes permiso para ver esta pantalla.'),
    ).toBeInTheDocument();
  });
});

describe('ficha de cumplimiento del cliente', () => {
  const ficha: CumplimientoCliente = {
    cliente: { id: 'cl-1', nombre: 'Ana Gómez', tipoDocumento: 'CC', numeroDocumento: '1234' },
    perfil: null,
    acumulados: {
      comoRemitente: { dia: '50000.00', mes: '450000.00', anio: '900000.00' },
      comoBeneficiario: { dia: '0.000', mes: '0.000', anio: '0.000' },
    },
    alertas: [],
  };

  it('el vendedor ve los acumulados y guarda la ficha, sin cambiar el nivel', async () => {
    const api = simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') },
      'GET /clientes': {
        cuerpo: {
          clientes: [
            {
              id: 'cl-1',
              tipoDocumento: 'CC',
              numeroDocumento: '1234',
              nombre: 'Ana Gómez',
              telefono: null,
              activo: true,
              creadoEn: '2026-11-01T15:00:00.000Z',
              mediosPago: [],
            },
          ],
          total: 1,
        },
      },
      'GET /clientes/cl-1': {
        cuerpo: {
          cliente: {
            id: 'cl-1',
            tipoDocumento: 'CC',
            numeroDocumento: '1234',
            nombre: 'Ana Gómez',
            telefono: null,
            activo: true,
            creadoEn: '2026-11-01T15:00:00.000Z',
            mediosPago: [],
          },
        },
      },
      'GET /clientes/bancos': { cuerpo: { bancos: [] } },
      'GET /cumplimiento/clientes/cl-1': { cuerpo: ficha },
      'PUT /cumplimiento/clientes/cl-1/ficha': { cuerpo: { ok: true } },
    });
    const { usuario } = renderizarApp('/clientes');
    await usuario.click(await screen.findByRole('button', { name: /Ana Gómez/ }));
    await usuario.click(await screen.findByRole('button', { name: 'Ficha de cumplimiento' }));
    expect(await screen.findByText(/COP 450\.000/)).toBeInTheDocument();
    expect(screen.queryByText('Cambiar nivel de riesgo')).toBeNull();
    await usuario.type(screen.getByLabelText('Actividad económica'), 'Comerciante');
    await usuario.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    await waitFor(() => expect(api.de('PUT', '/cumplimiento/clientes/cl-1/ficha')).toHaveLength(1));
    expect(api.de('PUT', '/cumplimiento/clientes/cl-1/ficha')[0]?.cuerpo).toMatchObject({
      actividadEconomica: 'Comerciante',
      pep: false,
    });
  });
});
