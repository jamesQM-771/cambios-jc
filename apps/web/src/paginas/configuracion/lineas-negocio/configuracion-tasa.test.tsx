import type { Permiso } from '@cambios-jc/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { LineaNegocio } from '../../../modulos/lineas-negocio/tipos.js';
import {
  errorApi,
  sesionFalsa,
  simularApi,
  type PeticionFalsa,
  type RespuestaFalsa,
} from '../../../pruebas/api-falsa.js';
import { renderizarApp } from '../../../pruebas/renderizar.js';

const transferencias: LineaNegocio = {
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
const dolares: LineaNegocio = {
  ...transferencias,
  id: 'l-2',
  nombre: 'Dólares',
  clase: 'divisa_caja',
  monedaOrigen: 'USD',
  monedaDestino: 'COP',
  modoTasa: 'directo',
  margenVenta: null,
};

const RUTA_TRANSFERENCIAS = '/lineas-negocio/l-1/configuracion-tasa';

function abrir(
  extra: Record<string, RespuestaFalsa | ((peticion: PeticionFalsa) => RespuestaFalsa)> = {},
  permisos?: Permiso[],
) {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador', permisos ? { permisos } : {}) },
    'GET /lineas-negocio': { cuerpo: { lineasNegocio: [transferencias, dolares] } },
    ...extra,
  });
  return { api, ...renderizarApp('/configuracion/lineas-negocio') };
}

async function abrirDialogo(usuario: ReturnType<typeof abrir>['usuario'], linea: string) {
  await usuario.click(await screen.findByRole('button', { name: `Más acciones de ${linea}` }));
  await usuario.click(screen.getByRole('menuitem', { name: 'Modo y margen de la tasa' }));
  return screen.findByRole('dialog');
}

describe('modo y margen de la tasa de una línea', () => {
  it('la tabla dice cómo se publica la tasa de cada línea', async () => {
    abrir();

    expect(await screen.findByText('Proveedor + 11 %')).toBeInTheDocument();
    expect(screen.getByText('Directo')).toBeInTheDocument();
  });

  it('cambiar el margen envía el porcentaje con punto aunque se escriba con coma', async () => {
    const { api, usuario } = abrir({
      [`PATCH ${RUTA_TRANSFERENCIAS}`]: {
        cuerpo: { lineaNegocio: { ...transferencias, margenVenta: '12.500000' } },
      },
    });
    const dialogo = await abrirDialogo(usuario, 'Transferencias a Venezuela');

    const margen = within(dialogo).getByLabelText('Margen de venta (%)');
    expect(margen).toHaveValue('11');
    await usuario.clear(margen);
    await usuario.type(margen, '12,5');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(api.de('PATCH', RUTA_TRANSFERENCIAS)).toHaveLength(1));
    expect(api.de('PATCH', RUTA_TRANSFERENCIAS)[0]?.cuerpo).toEqual({
      modoTasa: 'porcentaje',
      margenVenta: '12.5',
    });
    expect(await screen.findByText('Se guardó la configuración de la tasa.')).toBeInTheDocument();
  });

  it('pasar a directo avisa que se quita el margen y no lo envía', async () => {
    const { api, usuario } = abrir({
      [`PATCH ${RUTA_TRANSFERENCIAS}`]: {
        cuerpo: { lineaNegocio: { ...transferencias, modoTasa: 'directo', margenVenta: null } },
      },
    });
    const dialogo = await abrirDialogo(usuario, 'Transferencias a Venezuela');

    await usuario.selectOptions(
      within(dialogo).getByLabelText('Cómo se publica la tasa'),
      'directo',
    );

    expect(within(dialogo).getByRole('alert')).toHaveTextContent('se quita el margen guardado');
    expect(within(dialogo).queryByLabelText('Margen de venta (%)')).not.toBeInTheDocument();

    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(api.de('PATCH', RUTA_TRANSFERENCIAS)).toHaveLength(1));
    expect(api.de('PATCH', RUTA_TRANSFERENCIAS)[0]?.cuerpo).toEqual({ modoTasa: 'directo' });
  });

  it('en modo porcentaje no deja guardar sin margen de venta', async () => {
    const { usuario } = abrir();
    const dialogo = await abrirDialogo(usuario, 'Dólares');

    await usuario.selectOptions(
      within(dialogo).getByLabelText('Cómo se publica la tasa'),
      'porcentaje',
    );

    expect(within(dialogo).getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('el error del servidor se muestra en el campo y el diálogo sigue abierto', async () => {
    const { usuario } = abrir({
      [`PATCH ${RUTA_TRANSFERENCIAS}`]: errorApi(400, 'VALIDACION_FALLIDA', 'Revisa los datos.', [
        { campo: 'margenVenta', mensaje: 'Escribe un porcentaje positivo, sin el signo %.' },
      ]),
    });
    const dialogo = await abrirDialogo(usuario, 'Transferencias a Venezuela');

    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    expect(
      await within(dialogo).findByText('Escribe un porcentaje positivo, sin el signo %.'),
    ).toBeInTheDocument();
    expect(within(dialogo).getByLabelText('Margen de venta (%)')).toBeInvalid();
  });

  it('sin el permiso margen.configurar la acción no aparece', async () => {
    abrir({}, ['empresa.configurar']);

    await screen.findByText('Proveedor + 11 %');

    expect(
      screen.queryByRole('button', { name: 'Más acciones de Transferencias a Venezuela' }),
    ).not.toBeInTheDocument();
  });
});
