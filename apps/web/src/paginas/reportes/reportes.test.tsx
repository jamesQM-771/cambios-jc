import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sesionFalsa, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

const TABLERO = {
  tablero: {
    moneda: 'COP',
    gananciaHoy: '125000.00',
    gananciaMes: '3500000.00',
    remesasHoy: 12,
    liquidez: [
      { moneda: 'VES', disponible: '500000.000', comprometido: '120000.500', libre: '379999.500' },
    ],
    contrapartes: [{ moneda: 'COP', meDeben: '50000.00', lesDebo: '370000.00' }],
    alertasAbiertas: 2,
  },
};

function abrir() {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /reportes/tablero': { cuerpo: TABLERO },
    'GET /reportes/ganancia': {
      cuerpo: {
        reporte: {
          titulo: 'Ganancia neta por día',
          columnas: ['Fecha', 'Ganancia del día (COP)'],
          filas: [['2026-11-01', '125000.00']],
        },
      },
    },
    'GET /reportes/buscar': {
      cuerpo: {
        resultados: [
          {
            tipo: 'remesa',
            id: 'op-1',
            numeroComprobante: 128,
            fecha: '2026-11-01T15:00:00.000Z',
            estado: 'en_cola',
            cliente: 'Ana Gómez (1234)',
            beneficiario: 'Pedro',
            usuario: 'Laura',
            montoLocal: '50000.00',
            montoExtranjero: '13297.872',
            monedaExtranjera: 'VES',
            tasa: '3.760000',
          },
        ],
        pagina: 1,
        hayMas: false,
      },
    },
    'POST /datos/migracion/saldos-contrapartes': (peticion) => ({
      cuerpo: {
        filas: [
          {
            linea: 2,
            nombre: 'PROVEEDOR A',
            moneda: 'COP',
            saldoExcel: '-1250000.50',
            saldoSistema: '1250000.50',
            contraparteExiste: false,
            etiqueta: 'me_debe',
          },
        ],
        errores: [],
        aplicadas: (peticion.cuerpo as { aplicar: boolean }).aplicar ? 1 : 0,
        yaCargadas: 0,
      },
    }),
  });
  return { api, ...renderizarApp('/reportes') };
}

describe('pantalla de reportes', () => {
  it('el tablero muestra ganancia, liquidez y deudas', async () => {
    abrir();
    const ganancia = await screen.findByLabelText('Ganancia');
    expect(within(ganancia).getByText('COP 125.000')).toBeInTheDocument();
    const liquidez = screen.getByLabelText('Liquidez en VES');
    expect(within(liquidez).getByText('VES 379.999,500')).toBeInTheDocument();
    expect(screen.getByText(/Alertas de cumplimiento abiertas/).parentElement).toHaveTextContent(
      ': 2',
    );
  });

  it('un reporte se ve en tabla y tiene su enlace CSV', async () => {
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole('tab', { name: 'Reportes' }));
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText('125000.00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Descargar CSV' }).getAttribute('href')).toMatch(
      /^\/api\/reportes\/ganancia\?desde=.*&formato=csv$/,
    );
  });

  it('el histórico busca con los filtros', async () => {
    const { api, usuario } = abrir();
    await usuario.click(await screen.findByRole('tab', { name: 'Histórico' }));
    await usuario.type(await screen.findByLabelText('Documento o nombre'), 'Ana');
    await usuario.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() =>
      expect(api.de('GET', '/reportes/buscar').some((p) => p.consulta.get('texto') === 'Ana')).toBe(
        true,
      ),
    );
    expect(await screen.findByText('Ana Gómez (1234)')).toBeInTheDocument();
  });

  it('la carga de saldos muestra la vista previa con la etiqueta y luego aplica', async () => {
    const { api, usuario } = abrir();
    await usuario.click(await screen.findByRole('tab', { name: 'Datos' }));
    expect(screen.getByRole('link', { name: 'Descargar todos los datos' })).toHaveAttribute(
      'href',
      '/api/datos/exportacion',
    );
    await usuario.type(screen.getByLabelText('Contenido del CSV'), 'nombre;moneda;saldo');
    const aplicar = screen.getByRole('button', { name: 'Aplicar la carga' });
    expect(aplicar).toBeDisabled();
    await usuario.click(screen.getByRole('button', { name: 'Ver vista previa' }));
    expect(await screen.findByText('PROVEEDOR A')).toBeInTheDocument();
    expect(screen.getByText('Me debe')).toBeInTheDocument();
    await usuario.click(aplicar);
    await waitFor(() =>
      expect(api.de('POST', '/datos/migracion/saldos-contrapartes')).toHaveLength(2),
    );
    expect(api.de('POST', '/datos/migracion/saldos-contrapartes')[1]?.cuerpo).toMatchObject({
      aplicar: true,
    });
  });

  it('el vendedor no entra', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') } });
    renderizarApp('/reportes');
    expect(
      await screen.findByText('No tienes permiso para ver esta pantalla.'),
    ).toBeInTheDocument();
  });
});
