import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Empresa } from '../../modulos/empresa/api.js';
import { sesionFalsa, simularApi } from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

const empresaFalsa = (cambios: Partial<Empresa> = {}): Empresa => ({
  nombre: 'Casa de Cambio Ejemplo',
  nit: null,
  telefono: null,
  whatsapp: null,
  direccion: null,
  logoUrl: null,
  monedaLocal: 'COP',
  zonaHoraria: 'America/Bogota',
  textoPieRecibo: null,
  actualizadaEn: '2026-03-10T15:00:00.000Z',
  ...cambios,
});

function abrir(empresa = empresaFalsa()) {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /empresa': { cuerpo: { empresa } },
    'PATCH /empresa': () => ({ cuerpo: { empresa } }),
  });
  return { api, ...renderizarApp('/empresa') };
}

const guardar = async (usuario: ReturnType<typeof abrir>['usuario']) =>
  usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));

const enviado = (api: ReturnType<typeof abrir>['api']) => api.de('PATCH', '/empresa')[0]?.cuerpo;

describe('NIT por partes', () => {
  it('no admite letras y se guarda sin puntos, con el dígito tras el guion', async () => {
    const { api, usuario } = abrir();

    await usuario.type(await screen.findByLabelText('NIT'), '9a0b0.123.456');
    await usuario.type(screen.getByLabelText('Dígito de verificación'), 'x78');
    expect(screen.getByLabelText('NIT')).toHaveValue('900123456');
    expect(screen.getByLabelText('Dígito de verificación')).toHaveValue('7');
    expect(screen.getByText('Se muestra como 900.123.456-7.')).toBeInTheDocument();
    await guardar(usuario);

    await waitFor(() => expect(api.de('PATCH', '/empresa')).toHaveLength(1));
    expect(enviado(api)).toEqual({ nit: '900123456-7' });
  });

  it('al pegar el NIT completo, el dígito de verificación pasa a su campo', async () => {
    const { usuario } = abrir();
    const nit = await screen.findByLabelText('NIT');

    await usuario.click(nit);
    await usuario.paste('900.123.456-7');

    expect(nit).toHaveValue('900123456');
    expect(screen.getByLabelText('Dígito de verificación')).toHaveValue('7');
  });

  it('un NIT guardado con puntos no cuenta como cambio hasta que alguien lo edite', async () => {
    abrir(empresaFalsa({ nit: '900.123.456-7' }));

    expect(await screen.findByLabelText('NIT')).toHaveValue('900123456');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('con menos de 5 dígitos no se envía y dice qué corregir', async () => {
    const { api, usuario } = abrir();

    await usuario.type(await screen.findByLabelText('NIT'), '123');
    await guardar(usuario);

    expect(await screen.findByRole('alert')).toHaveTextContent('Hay un dato por corregir');
    expect(screen.getByLabelText('NIT')).toBeInvalid();
    expect(api.de('PATCH', '/empresa')).toHaveLength(0);
  });
});

describe('teléfono y WhatsApp con país', () => {
  it('se guardan en formato internacional y se muestran agrupados', async () => {
    const { api, usuario } = abrir();

    await usuario.type(await screen.findByLabelText('Teléfono'), '300 123 4567');
    await usuario.selectOptions(screen.getByLabelText('País de WhatsApp'), 'Venezuela (+58)');
    await usuario.type(screen.getByLabelText('WhatsApp'), '4121234567');
    expect(screen.getByText('+57 300 123 4567')).toBeInTheDocument();
    expect(screen.getByText('+58 412 123 4567')).toBeInTheDocument();
    await guardar(usuario);

    await waitFor(() => expect(api.de('PATCH', '/empresa')).toHaveLength(1));
    expect(enviado(api)).toEqual({ telefono: '+573001234567', whatsapp: '+584121234567' });
  });

  it('no admite letras en el número', async () => {
    const { usuario } = abrir();

    await usuario.type(await screen.findByLabelText('Teléfono'), 'abc300x');

    expect(screen.getByLabelText('Teléfono')).toHaveValue('300');
  });

  it('un teléfono antiguo sin código de país se muestra sin cambiar lo guardado', async () => {
    abrir(empresaFalsa({ whatsapp: '3000000000' }));

    expect(await screen.findByLabelText('WhatsApp')).toHaveValue('3000000000');
    expect(screen.getByLabelText('País de WhatsApp')).toHaveValue('57');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('un número demasiado corto no se envía', async () => {
    const { api, usuario } = abrir();

    await usuario.type(await screen.findByLabelText('Teléfono'), '12345');
    await guardar(usuario);

    expect(await screen.findByRole('alert')).toHaveTextContent('entre 7 y 12 dígitos');
    expect(api.de('PATCH', '/empresa')).toHaveLength(0);
  });
});

describe('dirección por partes', () => {
  it('arma una sola línea con lo que se escribe y la muestra antes de guardar', async () => {
    const { api, usuario } = abrir();

    await usuario.selectOptions(await screen.findByLabelText('Tipo de vía'), 'Avenida');
    await usuario.type(screen.getByLabelText('Vía'), '0');
    await usuario.type(screen.getByLabelText('Número'), '11');
    await usuario.type(screen.getByLabelText('Placa'), '45');
    await usuario.type(screen.getByLabelText('Complemento'), 'Local 2');
    await usuario.type(screen.getByLabelText('Ciudad o municipio'), 'Cúcuta');
    await usuario.type(screen.getByLabelText('Departamento o estado'), 'Norte de Santander');
    await usuario.type(screen.getByLabelText('País'), 'Colombia');

    const armada = 'Avenida 0 # 11-45 Local 2, Cúcuta, Norte de Santander, Colombia';
    expect(screen.getByText(armada)).toBeInTheDocument();
    await guardar(usuario);

    await waitFor(() => expect(api.de('PATCH', '/empresa')).toHaveLength(1));
    expect(enviado(api)).toEqual({ direccion: armada });
  });

  it('una dirección guardada con ese formato vuelve a abrirse por partes', async () => {
    abrir(empresaFalsa({ direccion: 'Calle 10 # 5-23, Cúcuta, Norte de Santander' }));

    expect(await screen.findByLabelText('Vía')).toHaveValue('10');
    expect(screen.getByLabelText('Número')).toHaveValue('5');
    expect(screen.getByLabelText('Placa')).toHaveValue('23');
    expect(screen.getByLabelText('Ciudad o municipio')).toHaveValue('Cúcuta');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('una dirección antigua en texto libre se conserva y se puede reescribir por partes', async () => {
    const { usuario } = abrir(empresaFalsa({ direccion: 'Frente al parque principal' }));

    expect(await screen.findByLabelText('Dirección')).toHaveValue('Frente al parque principal');
    expect(screen.queryByLabelText('Vía')).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Escribirla por partes' }));

    expect(screen.getByLabelText('Vía')).toHaveValue('');
    expect(screen.getByText('Sin dirección.')).toBeInTheDocument();
  });
});

describe('zona horaria y recibos', () => {
  it('la zona es una lista y muestra la hora actual en esa zona', async () => {
    abrir();

    const zona = await screen.findByLabelText('Zona horaria');
    expect(zona.tagName).toBe('SELECT');
    expect(zona).toHaveValue('America/Bogota');
    expect(zona).toHaveAccessibleDescription(/Ahora mismo allí son las/);
  });

  it('cambiar la zona pide confirmación antes de guardar', async () => {
    const { api, usuario } = abrir();

    await usuario.selectOptions(await screen.findByLabelText('Zona horaria'), 'America/Caracas');
    await guardar(usuario);

    const dialogo = await screen.findByRole('dialog', { name: '¿Cambiar la zona horaria?' });
    expect(dialogo).toHaveTextContent('todas las fechas del sistema');
    expect(api.de('PATCH', '/empresa')).toHaveLength(0);

    await usuario.click(within(dialogo).getByRole('button', { name: 'Sí, cambiarla' }));

    await waitFor(() => expect(api.de('PATCH', '/empresa')).toHaveLength(1));
    expect(enviado(api)).toEqual({ zonaHoraria: 'America/Caracas' });
  });

  it('una zona guardada que no está en la lista se conserva como opción', async () => {
    abrir(empresaFalsa({ zonaHoraria: 'America/Bogota' }));
    const zona = await screen.findByLabelText('Zona horaria');

    expect(within(zona).getAllByRole('option').length).toBeGreaterThanOrEqual(12);
  });

  it('el pie del recibo se llama por lo que es y avisa que todavía no se usa', async () => {
    abrir();

    expect(await screen.findByLabelText('Mensaje al pie del recibo')).toBeInTheDocument();
    expect(screen.getByText(/se usará cuando el sistema imprima recibos/)).toBeInTheDocument();
  });
});
