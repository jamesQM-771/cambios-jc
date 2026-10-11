import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { LineaNegocio } from '../../../modulos/lineas-negocio/tipos.js';
import type { Tasa } from '../../../modulos/tasas/tipos.js';
import {
  errorApi,
  sesionFalsa,
  simularApi,
  type PeticionFalsa,
  type RespuestaFalsa,
} from '../../../pruebas/api-falsa.js';
import { renderizarApp } from '../../../pruebas/renderizar.js';

const lineaPorcentaje: LineaNegocio = {
  id: 'l-1',
  nombre: 'Transferencias a Venezuela',
  clase: 'remesa',
  monedaOrigen: 'COP',
  monedaDestino: 'VES',
  activa: true,
  modoTasa: 'porcentaje',
  margenCompra: null,
  margenVenta: '11.000000',
};

const lineaDirecta: LineaNegocio = {
  id: 'l-2',
  nombre: 'Dólares',
  clase: 'divisa_caja',
  monedaOrigen: 'USD',
  monedaDestino: 'COP',
  activa: true,
  modoTasa: 'directo',
  margenCompra: null,
  margenVenta: null,
};

const tasaFalsa = (cambios: Partial<Tasa> = {}): Tasa => ({
  id: 't-1',
  lineaNegocioId: 'l-1',
  lineaNegocioNombre: 'Transferencias a Venezuela',
  tasaReferencia: '4.680000',
  margenUsado: '11.000000',
  tasaCompra: null,
  tasaVenta: '5.190000',
  publicadaPorId: 'u-1',
  publicadaPorNombre: 'Prueba UI',
  motivo: null,
  vigenteDesde: '2026-03-10T15:00:00.000Z',
  vigenteHasta: null,
  ...cambios,
});

function abrirTasas(
  lineasNegocio: LineaNegocio[] = [lineaPorcentaje, lineaDirecta],
  extra: Record<string, RespuestaFalsa | ((peticion: PeticionFalsa) => RespuestaFalsa)> = {},
) {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /lineas-negocio': { cuerpo: { lineasNegocio } },
    ...extra,
  });
  return { api, ...renderizarApp('/configuracion/tasas') };
}

describe('pantalla de tasas', () => {
  it('sin línea elegida no muestra el formulario ni el historial', async () => {
    abrirTasas();

    expect(await screen.findByLabelText('Línea de negocio')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar tasa' })).not.toBeInTheDocument();
  });

  it('modo porcentaje: calcula la venta en vivo y la publica', async () => {
    const { usuario } = abrirTasas([lineaPorcentaje], {
      'GET /tasas': (peticion) => ({
        cuerpo: {
          tasas: peticion.consulta.get('vigente') === 'true' ? [] : [],
        },
      }),
      'POST /tasas': () => ({ estado: 201, cuerpo: { tasa: tasaFalsa() } }),
    });
    await usuario.selectOptions(
      await screen.findByLabelText('Línea de negocio'),
      'Transferencias a Venezuela — Porcentaje (proveedor + margen)',
    );

    expect(
      await screen.findByText('Esta línea todavía no tiene tasa publicada.'),
    ).toBeInTheDocument();
    await usuario.type(screen.getByLabelText('Tasa del proveedor'), '4.68');

    expect(await screen.findByText('5,19')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Publicar tasa' }));

    expect(await screen.findByText('Se publicó la tasa.')).toBeInTheDocument();
  });

  it('modo directo: pide compra y venta, sin campo de referencia', async () => {
    const { usuario } = abrirTasas([lineaDirecta], {
      'GET /tasas': () => ({ cuerpo: { tasas: [] } }),
    });
    await usuario.selectOptions(
      await screen.findByLabelText('Línea de negocio'),
      'Dólares — Directo (compra y venta ya calculadas)',
    );

    expect(screen.queryByLabelText('Tasa del proveedor')).not.toBeInTheDocument();
    expect(await screen.findByLabelText('Tasa de compra')).toBeInTheDocument();
    expect(screen.getByLabelText('Tasa de venta')).toBeInTheDocument();
  });

  it('sin margen configurado, avisa y deshabilita el campo', async () => {
    const { usuario } = abrirTasas([{ ...lineaPorcentaje, margenVenta: null }], {
      'GET /tasas': () => ({ cuerpo: { tasas: [] } }),
    });
    await usuario.selectOptions(
      await screen.findByLabelText('Línea de negocio'),
      'Transferencias a Venezuela — Porcentaje (proveedor + margen)',
    );

    expect(await screen.findByText(/no tiene margen de venta configurado/)).toBeInTheDocument();
    expect(screen.getByLabelText('Tasa del proveedor')).toBeDisabled();
  });

  it('muestra el historial con la tasa vigente y las anteriores', async () => {
    const { usuario } = abrirTasas([lineaPorcentaje], {
      'GET /tasas': (peticion) => ({
        cuerpo: {
          tasas:
            peticion.consulta.get('vigente') === 'true'
              ? [tasaFalsa()]
              : [
                  tasaFalsa(),
                  tasaFalsa({
                    id: 't-0',
                    tasaVenta: '5.100000',
                    vigenteHasta: '2026-03-10T15:00:00.000Z',
                  }),
                ],
        },
      }),
    });

    await usuario.selectOptions(
      await screen.findByLabelText('Línea de negocio'),
      'Transferencias a Venezuela — Porcentaje (proveedor + margen)',
    );

    const tabla = await screen.findByRole('table');
    expect(tabla).toHaveTextContent('5,19');
    expect(tabla).toHaveTextContent('5,10');
    expect(tabla).toHaveTextContent('Vigente');
  });

  it('un vendedor no puede entrar', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('vendedor') } });
    renderizarApp('/configuracion/tasas');

    expect(await screen.findByRole('heading', { name: 'Sin acceso' })).toBeInTheDocument();
  });

  it('si las líneas fallan, lo dice', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
      'GET /lineas-negocio': errorApi(500, 'ERROR_INTERNO', 'Ocurrió un error.'),
    });
    renderizarApp('/configuracion/tasas');

    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error.');
  });
});
