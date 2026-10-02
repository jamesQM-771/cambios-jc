import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Empresa } from '../../modulos/empresa/api.js';
import {
  errorApi,
  sesionFalsa,
  simularApi,
  type PeticionFalsa,
  type RespuestaFalsa,
} from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

const empresaFalsa = (cambios: Partial<Empresa> = {}): Empresa => ({
  nombre: 'Casa de Cambio Ejemplo',
  nit: '900.000.000-0',
  telefono: null,
  whatsapp: '3000000000',
  direccion: 'Calle 1 # 2-3',
  logoUrl: null,
  monedaLocal: 'COP',
  zonaHoraria: 'America/Bogota',
  textoPieRecibo: null,
  actualizadaEn: '2026-03-10T15:00:00.000Z',
  ...cambios,
});

function abrirEmpresa(
  extra: Record<string, RespuestaFalsa | ((peticion: PeticionFalsa) => RespuestaFalsa)> = {},
  empresa = empresaFalsa(),
) {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /empresa': { cuerpo: { empresa } },
    ...extra,
  });
  return { api, ...renderizarApp('/empresa') };
}

const PNG = (nombre = 'logo.png', tipo = 'image/png') =>
  new File(['contenido'], nombre, { type: tipo });

describe('datos de la empresa', () => {
  it('muestra los datos actuales y no deja guardar mientras no haya cambios', async () => {
    abrirEmpresa();

    expect(await screen.findByLabelText('Nombre')).toHaveValue('Casa de Cambio Ejemplo');
    expect(screen.getByLabelText('NIT')).toHaveValue('900.000.000-0');
    expect(screen.getByLabelText('Teléfono')).toHaveValue('');
    expect(screen.getByLabelText('WhatsApp')).toHaveValue('3000000000');
    expect(screen.getByLabelText('Moneda local')).toHaveValue('COP');
    expect(screen.getByLabelText('Zona horaria')).toHaveValue('America/Bogota');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('envía solo lo que cambió y avisa que se guardó', async () => {
    const { api, usuario } = abrirEmpresa({
      'PATCH /empresa': () => ({
        cuerpo: {
          empresa: empresaFalsa({
            nombre: 'Cambios JC',
            actualizadaEn: '2026-03-11T15:00:00.000Z',
          }),
        },
      }),
    });
    const nombre = await screen.findByLabelText('Nombre');

    await usuario.clear(nombre);
    await usuario.type(nombre, 'Cambios JC');
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Se guardaron los cambios.')).toBeInTheDocument();
    expect(api.de('PATCH', '/empresa')[0]?.cuerpo).toEqual({ nombre: 'Cambios JC' });
    // El encabezado se actualiza: la sesión se vuelve a consultar.
    await waitFor(() => expect(api.de('GET', '/auth/yo').length).toBeGreaterThan(1));
    expect(await screen.findByLabelText('Nombre')).toHaveValue('Cambios JC');
  });

  it('un campo opcional que se vacía se envía como texto vacío (el servidor lo borra)', async () => {
    const { api, usuario } = abrirEmpresa({
      'PATCH /empresa': () => ({
        cuerpo: { empresa: empresaFalsa({ direccion: null, nit: '901.111.222-3' }) },
      }),
    });
    const nit = await screen.findByLabelText('NIT');

    await usuario.clear(nit);
    await usuario.type(nit, '901.111.222-3');
    await usuario.clear(screen.getByLabelText('Dirección'));
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(api.de('PATCH', '/empresa')).toHaveLength(1));
    expect(api.de('PATCH', '/empresa')[0]?.cuerpo).toEqual({ nit: '901.111.222-3', direccion: '' });
  });

  it('un cambio y su reverso vuelven a dejar el botón apagado', async () => {
    const { usuario } = abrirEmpresa();
    const nombre = await screen.findByLabelText('Nombre');

    await usuario.type(nombre, ' S. A.');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
    await usuario.clear(nombre);
    await usuario.type(nombre, 'Casa de Cambio Ejemplo');

    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('muestra el error por campo que devuelve el servidor', async () => {
    const { usuario } = abrirEmpresa({
      'PATCH /empresa': () =>
        errorApi(400, 'VALIDACION_FALLIDA', 'Los datos enviados no son válidos.', [
          { campo: 'nit', mensaje: 'El NIT solo lleva números, puntos y guion.' },
        ]),
    });
    const nit = await screen.findByLabelText('NIT');

    await usuario.clear(nit);
    await usuario.type(nit, 'abc-def');
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(
      await screen.findByText('El NIT solo lleva números, puntos y guion.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Los datos enviados no son válidos.');
    expect(screen.getByLabelText('NIT')).toBeInvalid();
  });

  it('si la empresa no está configurada o falla la consulta, lo dice', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
      'GET /empresa': errorApi(404, 'NO_ENCONTRADO', 'La empresa aún no está configurada.'),
    });
    renderizarApp('/empresa');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La empresa aún no está configurada.',
    );
  });
});

describe('logo de la empresa', () => {
  it('sin logo muestra un recuadro "Sin logo"; con logo, la imagen de la API', async () => {
    const { unmount } = abrirEmpresa();
    expect(await screen.findByText('Sin logo')).toBeInTheDocument();
    unmount();

    abrirEmpresa({}, empresaFalsa({ logoUrl: '/empresa/logo?v=abc' }));
    expect(await screen.findByAltText('Logo actual de la empresa')).toHaveAttribute(
      'src',
      '/api/empresa/logo?v=abc',
    );
  });

  it.each([
    [
      'un PDF',
      new File(['x'], 'logo.pdf', { type: 'application/pdf' }),
      'El logo debe ser una imagen PNG o JPG.',
    ],
    [
      'un SVG',
      new File(['x'], 'logo.svg', { type: 'image/svg+xml' }),
      'El logo debe ser una imagen PNG o JPG.',
    ],
    [
      'una imagen de más de 1 MB',
      new File([new Uint8Array(1_048_577)], 'grande.png', { type: 'image/png' }),
      'El archivo supera 1 MB, el máximo permitido.',
    ],
  ])('rechaza %s antes de enviarlo', async (_caso, archivo, mensaje) => {
    const { api, usuario } = abrirEmpresa();
    const campo = await screen.findByLabelText('Logo nuevo');

    await usuario.upload(campo, archivo);

    expect(await screen.findByText(mensaje)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subir logo' })).toBeDisabled();
    expect(screen.queryByAltText('Vista previa del logo nuevo')).not.toBeInTheDocument();
    expect(api.de('POST', '/empresa/logo')).toHaveLength(0);
  });

  it('un PNG válido muestra la vista previa y se sube como formulario con archivo', async () => {
    const { api, usuario } = abrirEmpresa({
      'POST /empresa/logo': () => ({
        cuerpo: {
          empresa: empresaFalsa({
            logoUrl: '/empresa/logo?v=nuevo',
            actualizadaEn: '2026-03-11T15:00:00.000Z',
          }),
        },
      }),
    });
    const campo = await screen.findByLabelText('Logo nuevo');
    const archivo = PNG();

    await usuario.upload(campo, archivo);
    expect(await screen.findByAltText('Vista previa del logo nuevo')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Subir logo' }));

    expect(await screen.findByText('El logo se actualizó.')).toBeInTheDocument();
    const formulario = api.de('POST', '/empresa/logo')[0]?.formulario;
    expect(formulario?.get('logo')).toBeInstanceOf(File);
    expect((formulario?.get('logo') as File).name).toBe('logo.png');
    expect(await screen.findByAltText('Logo actual de la empresa')).toHaveAttribute(
      'src',
      '/api/empresa/logo?v=nuevo',
    );
    // El campo queda vacío y sin vista previa.
    expect(screen.queryByAltText('Vista previa del logo nuevo')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subir logo' })).toBeDisabled();
  });

  it('si el servidor rechaza el archivo, muestra su mensaje', async () => {
    const { usuario } = abrirEmpresa({
      'POST /empresa/logo': () =>
        errorApi(400, 'ARCHIVO_INVALIDO', 'El logo debe ser una imagen PNG o JPG.'),
    });
    await usuario.upload(await screen.findByLabelText('Logo nuevo'), PNG());

    await usuario.click(await screen.findByRole('button', { name: 'Subir logo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El logo debe ser una imagen PNG o JPG.',
    );
  });

  it('subir el logo no borra lo que se estaba escribiendo en los datos', async () => {
    const { usuario } = abrirEmpresa({
      'POST /empresa/logo': () => ({
        cuerpo: {
          empresa: empresaFalsa({
            logoUrl: '/empresa/logo?v=otro',
            actualizadaEn: '2026-03-12T15:00:00.000Z',
          }),
        },
      }),
    });
    const nombre = await screen.findByLabelText('Nombre');
    await usuario.type(nombre, ' (borrador)');

    await usuario.upload(screen.getByLabelText('Logo nuevo'), PNG());
    await usuario.click(await screen.findByRole('button', { name: 'Subir logo' }));
    await screen.findByText('El logo se actualizó.');

    expect(within(document.body).getByLabelText('Nombre')).toHaveValue(
      'Casa de Cambio Ejemplo (borrador)',
    );
  });
});
