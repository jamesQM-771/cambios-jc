import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { RegistroAuditoria } from '../../modulos/auditoria/api.js';
import {
  errorApi,
  sesionFalsa,
  simularApi,
  type PeticionFalsa,
  type RespuestaFalsa,
} from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

const registroFalso = (cambios: Partial<RegistroAuditoria> = {}): RegistroAuditoria => ({
  id: '10',
  fecha: '2026-03-10T04:30:00.000Z', // 9 de marzo, 11:30 p. m. en Bogotá
  usuario: { id: 'u-ana', login: 'ana', nombre: 'Ana Pérez' },
  accion: 'usuario.crear',
  entidad: 'usuario',
  entidadId: 'abc-123',
  antes: null,
  despues: { login: 'marta', rol: 'vendedor' },
  ip: '10.0.0.7',
  agenteUsuario: 'Navegador de prueba',
  ...cambios,
});

const USUARIOS = {
  usuarios: [
    { id: 'u-ana', nombre: 'Ana Pérez', login: 'ana', rol: 'vendedor' },
    { id: 'u-luis', nombre: 'Luis Gómez', login: 'luis', rol: 'digitador' },
  ],
  total: 2,
  pagina: 1,
  porPagina: 100,
};

function abrirBitacora(
  registros: RegistroAuditoria[],
  extra: Record<string, RespuestaFalsa | ((peticion: PeticionFalsa) => RespuestaFalsa)> = {},
) {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /auditoria': { cuerpo: { registros, total: registros.length, pagina: 1, porPagina: 50 } },
    'GET /usuarios': { cuerpo: USUARIOS },
    ...extra,
  });
  return { api, ...renderizarApp('/bitacora') };
}

const ultimaConsulta = (api: ReturnType<typeof simularApi>) =>
  api.de('GET', '/auditoria').at(-1)?.consulta;

describe('bitácora', () => {
  it('lista los registros con la fecha en la zona horaria de la empresa', async () => {
    const { api } = abrirBitacora([
      registroFalso(),
      registroFalso({ id: '11', usuario: null, accion: 'auth.login_fallido', entidad: 'usuario' }),
    ]);

    const tabla = await screen.findByRole('table');
    const filas = within(tabla).getAllByRole('row').slice(1);
    expect(filas).toHaveLength(2);
    // 04:30 UTC del 10 de marzo es el 9 de marzo a las 11:30 p. m. en Bogotá.
    expect(filas[0]).toHaveTextContent(/9\/03\/2026/);
    expect(filas[0]).toHaveTextContent(/11:30/);
    expect(filas[0]).toHaveTextContent('Ana Pérez');
    expect(filas[0]).toHaveTextContent('usuario.crear');
    expect(filas[1]).toHaveTextContent('auth.login_fallido');
    expect(filas[1]).toHaveTextContent('—');
    // Sin filtros: la primera consulta solo trae la paginación.
    expect(Object.fromEntries(ultimaConsulta(api) ?? [])).toEqual({ pagina: '1', porPagina: '50' });
  });

  it('sin registros dice que no hay con esos filtros', async () => {
    abrirBitacora([]);

    expect(await screen.findByText('No hay registros con esos filtros.')).toBeInTheDocument();
  });

  it('si la API falla muestra el error', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
      'GET /auditoria': errorApi(
        403,
        'SIN_PERMISO',
        'No tienes permiso para realizar esta acción.',
      ),
      'GET /usuarios': { cuerpo: USUARIOS },
    });
    renderizarApp('/bitacora');

    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso');
  });

  it('el filtro de usuario ofrece a los usuarios del sistema', async () => {
    abrirBitacora([registroFalso()]);

    const selector = await screen.findByLabelText('Usuario');
    await waitFor(() =>
      expect(
        within(selector).getByRole('option', { name: 'Luis Gómez (luis)' }),
      ).toBeInTheDocument(),
    );
  });
});

describe('filtros de la bitácora', () => {
  it('Filtrar consulta con las fechas, el usuario, la acción y la entidad elegidos', async () => {
    const { api, usuario } = abrirBitacora([registroFalso()]);
    await screen.findByRole('table');

    await usuario.type(screen.getByLabelText('Desde'), '2026-03-01');
    await usuario.type(screen.getByLabelText('Hasta'), '2026-03-10');
    await waitFor(() =>
      expect(
        within(screen.getByLabelText('Usuario')).getByRole('option', { name: 'Ana Pérez (ana)' }),
      ).toBeInTheDocument(),
    );
    await usuario.selectOptions(screen.getByLabelText('Usuario'), 'Ana Pérez (ana)');
    await usuario.selectOptions(screen.getByLabelText('Acción'), 'usuario.crear');
    await usuario.selectOptions(screen.getByLabelText('Sobre qué'), 'usuario');
    const antes = api.de('GET', '/auditoria').length;
    await usuario.click(screen.getByRole('button', { name: 'Filtrar' }));

    await waitFor(() => expect(api.de('GET', '/auditoria').length).toBeGreaterThan(antes));
    expect(Object.fromEntries(ultimaConsulta(api) ?? [])).toEqual({
      desde: '2026-03-01',
      hasta: '2026-03-10',
      usuarioId: 'u-ana',
      accion: 'usuario.crear',
      entidad: 'usuario',
      pagina: '1',
      porPagina: '50',
    });
  });

  it('escribir en un filtro no consulta hasta pulsar Filtrar', async () => {
    const { api, usuario } = abrirBitacora([registroFalso()]);
    await screen.findByRole('table');
    const antes = api.de('GET', '/auditoria').length;

    await usuario.selectOptions(screen.getByLabelText('Acción'), 'usuario.crear');

    expect(api.de('GET', '/auditoria')).toHaveLength(antes);
  });

  it('con "Desde" posterior a "Hasta" avisa y no consulta', async () => {
    const { api, usuario } = abrirBitacora([registroFalso()]);
    await screen.findByRole('table');
    const antes = api.de('GET', '/auditoria').length;

    await usuario.type(screen.getByLabelText('Desde'), '2026-03-12');
    await usuario.type(screen.getByLabelText('Hasta'), '2026-03-10');
    await usuario.click(screen.getByRole('button', { name: 'Filtrar' }));

    expect(
      await screen.findByText('La fecha "Desde" no puede ser posterior a "Hasta".'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Desde')).toBeInvalid();
    expect(api.de('GET', '/auditoria')).toHaveLength(antes);
  });

  it('Limpiar borra los filtros y vuelve a consultar sin ellos', async () => {
    const { api, usuario } = abrirBitacora([registroFalso()]);
    await screen.findByRole('table');
    await usuario.selectOptions(screen.getByLabelText('Sobre qué'), 'usuario');
    await usuario.click(screen.getByRole('button', { name: 'Filtrar' }));
    await waitFor(() => expect(ultimaConsulta(api)?.get('entidad')).toBe('usuario'));

    await usuario.click(screen.getByRole('button', { name: 'Limpiar' }));

    // La consulta sin filtros ya estaba en caché: se restablecen los campos y vuelve el listado completo.
    expect(screen.getByLabelText('Sobre qué')).toHaveValue('');
    expect(screen.getByLabelText('Desde')).toHaveValue('');
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('la paginación conserva los filtros aplicados', async () => {
    const { api, usuario } = abrirBitacora([registroFalso()], {
      'GET /auditoria': (peticion) => ({
        cuerpo: {
          registros: [registroFalso()],
          total: 120,
          pagina: Number(peticion.consulta.get('pagina') ?? 1),
          porPagina: 50,
        },
      }),
    });
    await screen.findByRole('table');
    await usuario.selectOptions(screen.getByLabelText('Sobre qué'), 'usuario');
    await usuario.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(await screen.findByText('Mostrando 1–50 de 120')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(await screen.findByText('Mostrando 51–100 de 120')).toBeInTheDocument();
    expect(ultimaConsulta(api)?.get('pagina')).toBe('2');
    expect(ultimaConsulta(api)?.get('entidad')).toBe('usuario');
  });
});

describe('detalle de un registro', () => {
  it('muestra el antes y el después lado a lado, con la IP y el dispositivo', async () => {
    const { usuario } = abrirBitacora([
      registroFalso({
        accion: 'empresa.editar',
        entidad: 'empresa',
        antes: { nombre: 'Casa Vieja' },
        despues: { nombre: 'Casa Nueva' },
      }),
    ]);

    await usuario.click(
      await screen.findByRole('button', { name: 'Ver detalle de empresa.editar' }),
    );

    const dialogo = await screen.findByRole('dialog', { name: 'Detalle del registro' });
    expect(
      within(dialogo).getByRole('heading', { name: 'Antes' }).nextElementSibling,
    ).toHaveTextContent('"nombre": "Casa Vieja"');
    expect(
      within(dialogo).getByRole('heading', { name: 'Después' }).nextElementSibling,
    ).toHaveTextContent('"nombre": "Casa Nueva"');
    const cambios = within(dialogo).getByRole('table', { name: 'Campos que cambiaron' });
    expect(
      within(cambios).getByRole('row', { name: 'Nombre Casa Vieja Casa Nueva' }),
    ).toBeVisible();
    expect(within(dialogo).getByText('10.0.0.7')).toBeInTheDocument();
    expect(within(dialogo).getByText('Navegador de prueba')).toBeInTheDocument();
    expect(within(dialogo).getByText('Ana Pérez (ana)')).toBeInTheDocument();
    expect(within(dialogo).getByText(/9\/03\/2026/)).toBeInTheDocument();
  });

  it('un registro sin datos antes/después o sin usuario lo dice claramente', async () => {
    const { usuario } = abrirBitacora([
      registroFalso({
        usuario: null,
        antes: null,
        despues: null,
        entidadId: null,
        ip: null,
        agenteUsuario: null,
      }),
    ]);

    await usuario.click(await screen.findByRole('button', { name: /Ver detalle/ }));

    const dialogo = await screen.findByRole('dialog', { name: 'Detalle del registro' });
    expect(within(dialogo).getAllByText('Sin datos')).toHaveLength(2);
    expect(within(dialogo).getByText(/Sin usuario/)).toBeInTheDocument();
    expect(within(dialogo).getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('el botón Cerrar cierra el detalle', async () => {
    const { usuario } = abrirBitacora([registroFalso()]);
    await usuario.click(await screen.findByRole('button', { name: /Ver detalle/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Detalle del registro' });

    await usuario.click(within(dialogo).getByRole('button', { name: 'Cerrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
