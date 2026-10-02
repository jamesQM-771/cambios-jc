import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { UsuarioLista } from '../../modulos/usuarios/tipos.js';
import {
  errorApi,
  sesionFalsa,
  simularApi,
  type PeticionFalsa,
  type RespuestaFalsa,
} from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

const usuarioFalso = (cambios: Partial<UsuarioLista> = {}): UsuarioLista => ({
  id: 'u-ana',
  nombre: 'Ana Pérez',
  login: 'ana',
  rol: 'vendedor',
  sucursalId: null,
  sucursalNombre: null,
  activo: true,
  tiene2fa: true,
  debeCambiarContrasena: false,
  bloqueadoHasta: null,
  ultimoAcceso: '2026-03-10T15:00:00.000Z',
  creadoEn: '2026-01-01T00:00:00.000Z',
  ...cambios,
});

const MIO = usuarioFalso({
  id: 'id-administrador',
  nombre: 'Persona administrador',
  login: 'admin',
  rol: 'administrador',
});
const SUCURSALES = { sucursales: [{ id: 's-1', nombre: 'Principal', ciudad: 'Cúcuta' }] };

const lista = (usuarios: UsuarioLista[], extra: Record<string, number> = {}) => ({
  cuerpo: { usuarios, total: usuarios.length, pagina: 1, porPagina: 20, ...extra },
});

/** Abre la pantalla de usuarios como administrador, con la lista y las rutas extra indicadas. */
function abrirUsuarios(
  usuarios: UsuarioLista[],
  extra: Record<string, RespuestaFalsa | ((peticion: PeticionFalsa) => RespuestaFalsa)> = {},
) {
  const api = simularApi({
    'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
    'GET /usuarios': lista(usuarios),
    'GET /sucursales': { cuerpo: SUCURSALES },
    ...extra,
  });
  return { api, ...renderizarApp('/usuarios') };
}

const filaDe = async (nombre: string) => {
  // Se busca dentro de la tabla: el nombre de quien usa el sistema también aparece en el encabezado.
  const celda = await within(await screen.findByRole('table')).findByText(nombre);
  const fila = celda.closest('tr');
  if (!fila) throw new Error(`No hay fila para ${nombre}`);
  return fila;
};

describe('lista de usuarios', () => {
  it('muestra rol, sucursal, último acceso en la zona de la empresa y las etiquetas de estado', async () => {
    abrirUsuarios([
      MIO,
      usuarioFalso({
        sucursalNombre: 'Principal',
        debeCambiarContrasena: true,
        tiene2fa: false,
      }),
      usuarioFalso({
        id: 'u-luis',
        nombre: 'Luis Gómez',
        login: 'luis',
        rol: 'digitador',
        activo: false,
        ultimoAcceso: null,
      }),
    ]);

    const ana = await filaDe('Ana Pérez');
    expect(within(ana).getByText('Vendedor')).toBeInTheDocument();
    expect(within(ana).getByText('Principal')).toBeInTheDocument();
    expect(within(ana).getByText('Contraseña temporal')).toBeInTheDocument();
    expect(within(ana).getByText('Sin verificación en dos pasos')).toBeInTheDocument();
    // 15:00 UTC son las 10:00 de la mañana en Bogotá.
    expect(within(ana).getByText(/10:00/)).toBeInTheDocument();
    const luis = await filaDe('Luis Gómez');
    expect(within(luis).getByText('Inactivo')).toBeInTheDocument();
    expect(within(luis).getByText('Nunca')).toBeInTheDocument();
  });

  it('marca la fila propia y muestra una cuenta bloqueada', async () => {
    abrirUsuarios([
      MIO,
      usuarioFalso({ bloqueadoHasta: new Date(Date.now() + 600_000).toISOString() }),
    ]);

    const propia = await filaDe('Persona administrador');
    expect(propia).toHaveTextContent('(tú)');
    expect(within(await filaDe('Ana Pérez')).getByText(/Bloqueado hasta/)).toBeInTheDocument();
  });

  it('un bloqueo que ya pasó no se muestra', async () => {
    abrirUsuarios([usuarioFalso({ bloqueadoHasta: new Date(Date.now() - 600_000).toISOString() })]);

    const fila = await filaDe('Ana Pérez');
    expect(within(fila).queryByText(/Bloqueado hasta/)).not.toBeInTheDocument();
  });

  it('sin usuarios dice que todavía no hay; con filtros, que no hay con esos filtros', async () => {
    const { usuario } = abrirUsuarios([]);
    expect(await screen.findByText('Todavía no hay usuarios.')).toBeInTheDocument();

    await usuario.selectOptions(screen.getByLabelText('Rol'), 'digitador');

    expect(await screen.findByText('No hay usuarios con esos filtros.')).toBeInTheDocument();
  });

  it('si la API falla muestra el error', async () => {
    simularApi({
      'GET /auth/yo': { cuerpo: sesionFalsa('administrador') },
      'GET /usuarios': errorApi(403, 'SIN_PERMISO', 'No tienes permiso para realizar esta acción.'),
    });
    renderizarApp('/usuarios');

    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso');
  });
});

describe('filtros y paginación', () => {
  it('la búsqueda espera a que se deje de escribir y vuelve a la primera página', async () => {
    const { api, usuario } = abrirUsuarios([usuarioFalso()]);
    await screen.findByText('Ana Pérez');
    expect(api.de('GET', '/usuarios')[0]?.consulta.get('busqueda')).toBeNull();

    await usuario.type(screen.getByLabelText('Buscar'), 'ana');

    await waitFor(() => {
      const ultima = api.de('GET', '/usuarios').at(-1);
      expect(ultima?.consulta.get('busqueda')).toBe('ana');
    });
    // Escribir tres letras no pidió tres consultas distintas.
    const conBusqueda = api
      .de('GET', '/usuarios')
      .filter((llamada) => llamada.consulta.has('busqueda'));
    expect(conBusqueda).toHaveLength(1);
    expect(conBusqueda[0]?.consulta.get('pagina')).toBe('1');
  });

  it('filtra por rol y por estado, y se pueden limpiar', async () => {
    const { api, usuario } = abrirUsuarios([usuarioFalso()]);
    await screen.findByText('Ana Pérez');

    await usuario.selectOptions(screen.getByLabelText('Rol'), 'digitador');
    await usuario.selectOptions(screen.getByLabelText('Estado'), 'Inactivos');

    await waitFor(() => {
      const ultima = api.de('GET', '/usuarios').at(-1)?.consulta;
      expect(ultima?.get('rol')).toBe('digitador');
      expect(ultima?.get('activo')).toBe('false');
    });

    await usuario.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    // La consulta sin filtros ya estaba en caché: se restablece la pantalla sin pedir nada nuevo.
    expect(screen.getByLabelText('Rol')).toHaveValue('');
    expect(screen.getByLabelText('Estado')).toHaveValue('');
    expect(screen.getByLabelText('Buscar')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it('pagina: muestra el resumen y pide la página siguiente', async () => {
    const { api, usuario } = abrirUsuarios([usuarioFalso()], {
      'GET /usuarios': (peticion) => ({
        cuerpo: {
          usuarios: [usuarioFalso()],
          total: 45,
          pagina: Number(peticion.consulta.get('pagina') ?? 1),
          porPagina: 20,
        },
      }),
    });

    expect(await screen.findByText('Mostrando 1–20 de 45')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await usuario.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(await screen.findByText('Mostrando 21–40 de 45')).toBeInTheDocument();
    expect(api.de('GET', '/usuarios').at(-1)?.consulta.get('pagina')).toBe('2');
  });
});

describe('crear usuario', () => {
  const abrirFormulario = async (usuario: ReturnType<typeof renderizarApp>['usuario']) => {
    await usuario.click(await screen.findByRole('button', { name: 'Nuevo usuario' }));
    return screen.findByRole('dialog', { name: 'Nuevo usuario' });
  };

  it('crea el usuario y muestra la contraseña temporal una sola vez, con botón de copiar', async () => {
    const { api, usuario } = abrirUsuarios([MIO], {
      'POST /usuarios': () => ({
        estado: 201,
        cuerpo: {
          usuario: usuarioFalso({
            id: 'u-nuevo',
            nombre: 'Marta Ruiz',
            login: 'marta.ruiz',
            sucursalId: 's-1',
          }),
          contrasenaTemporal: 'Abcd2345Efgh6789',
        },
      }),
    });
    const dialogo = await abrirFormulario(usuario);
    const crear = within(dialogo).getByRole('button', { name: 'Crear usuario' });
    expect(crear).toBeDisabled();

    await usuario.type(within(dialogo).getByLabelText('Nombre completo'), 'Marta Ruiz');
    await usuario.type(within(dialogo).getByLabelText('Usuario'), 'marta.ruiz');
    await usuario.selectOptions(within(dialogo).getByLabelText('Rol'), 'digitador');
    await usuario.selectOptions(
      await within(dialogo).findByLabelText('Sucursal'),
      'Principal · Cúcuta',
    );
    await usuario.click(crear);

    const resultado = await screen.findByRole('dialog', { name: 'Usuario creado' });
    expect(api.de('POST', '/usuarios')[0]?.cuerpo).toEqual({
      nombre: 'Marta Ruiz',
      login: 'marta.ruiz',
      rol: 'digitador',
      sucursalId: 's-1',
    });
    expect(within(resultado).getByText('Abcd2345Efgh6789')).toBeInTheDocument();
    expect(within(resultado).getByText('marta.ruiz')).toBeInTheDocument();
    expect(within(resultado).getByRole('alert')).toHaveTextContent('Solo se muestra esta vez');

    await usuario.click(within(resultado).getByRole('button', { name: 'Copiar' }));
    expect(await navigator.clipboard.readText()).toBe('Abcd2345Efgh6789');
    expect(within(resultado).getByRole('button', { name: 'Copiado' })).toBeInTheDocument();

    const consultasAntes = api.de('GET', '/usuarios').length;
    await usuario.click(within(resultado).getByRole('button', { name: 'Listo' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Usuario creado' })).not.toBeInTheDocument(),
    );
    // La contraseña ya no está en pantalla, y la lista se actualizó tras crear el usuario.
    expect(screen.queryByText('Abcd2345Efgh6789')).not.toBeInTheDocument();
    expect(consultasAntes).toBeGreaterThan(1);
  });

  it('un usuario repetido muestra el error junto al campo y deja el formulario abierto', async () => {
    const { usuario } = abrirUsuarios([MIO], {
      'POST /usuarios': () =>
        errorApi(409, 'LOGIN_EN_USO', 'Ya existe un usuario con ese nombre de usuario.', [
          { campo: 'login', mensaje: 'Ya está en uso.' },
        ]),
    });
    const dialogo = await abrirFormulario(usuario);
    await usuario.type(within(dialogo).getByLabelText('Nombre completo'), 'Marta Ruiz');
    await usuario.type(within(dialogo).getByLabelText('Usuario'), 'admin');

    await usuario.click(within(dialogo).getByRole('button', { name: 'Crear usuario' }));

    expect(await within(dialogo).findByText('Ya está en uso.')).toBeInTheDocument();
    expect(within(dialogo).getByRole('alert')).toHaveTextContent('Ya existe un usuario');
    expect(screen.queryByRole('dialog', { name: 'Usuario creado' })).not.toBeInTheDocument();
  });

  it('cancelar cierra el formulario sin enviar nada, y al abrirlo otra vez empieza vacío', async () => {
    const { api, usuario } = abrirUsuarios([MIO]);
    let dialogo = await abrirFormulario(usuario);
    await usuario.type(within(dialogo).getByLabelText('Nombre completo'), 'Marta');

    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    dialogo = await abrirFormulario(usuario);

    expect(within(dialogo).getByLabelText('Nombre completo')).toHaveValue('');
    expect(api.de('POST', '/usuarios')).toHaveLength(0);
  });
});

describe('editar usuario', () => {
  const abrirEdicion = async (usuario: ReturnType<typeof renderizarApp>['usuario']) => {
    await usuario.click(await screen.findByRole('button', { name: 'Editar a Ana Pérez' }));
    return screen.findByRole('dialog', { name: 'Editar usuario' });
  };

  it('muestra los datos actuales, sin el campo Usuario, y envía solo lo que cambió', async () => {
    const { api, usuario } = abrirUsuarios([usuarioFalso()], {
      'PATCH /usuarios/u-ana': () => ({ cuerpo: { usuario: usuarioFalso({ rol: 'digitador' }) } }),
    });
    const dialogo = await abrirEdicion(usuario);
    expect(within(dialogo).getByLabelText('Nombre completo')).toHaveValue('Ana Pérez');
    expect(within(dialogo).getByLabelText('Rol')).toHaveValue('vendedor');
    expect(within(dialogo).queryByLabelText('Usuario')).not.toBeInTheDocument();

    await usuario.selectOptions(within(dialogo).getByLabelText('Rol'), 'digitador');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Se guardaron los cambios de Ana Pérez.')).toBeInTheDocument();
    expect(api.de('PATCH', '/usuarios/u-ana')[0]?.cuerpo).toEqual({ rol: 'digitador' });
  });

  it('quitar la sucursal se envía como null', async () => {
    const { api, usuario } = abrirUsuarios(
      [usuarioFalso({ sucursalId: 's-1', sucursalNombre: 'Principal' })],
      { 'PATCH /usuarios/u-ana': () => ({ cuerpo: { usuario: usuarioFalso() } }) },
    );
    const dialogo = await abrirEdicion(usuario);
    await waitFor(() => expect(within(dialogo).getByLabelText('Sucursal')).toBeEnabled());
    await usuario.selectOptions(within(dialogo).getByLabelText('Sucursal'), 'Sin sucursal');

    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(api.de('PATCH', '/usuarios/u-ana')).toHaveLength(1));
    expect(api.de('PATCH', '/usuarios/u-ana')[0]?.cuerpo).toEqual({ sucursalId: null });
  });

  it('si no se cambia nada avisa y no envía nada', async () => {
    const { api, usuario } = abrirUsuarios([usuarioFalso()]);
    const dialogo = await abrirEdicion(usuario);

    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    expect(await within(dialogo).findByText('No hiciste ningún cambio.')).toBeInTheDocument();
    expect(api.de('PATCH', '/usuarios/u-ana')).toHaveLength(0);
  });

  it('muestra el error de la API, por ejemplo al intentar dejar el sistema sin administradores', async () => {
    const { usuario } = abrirUsuarios([usuarioFalso()], {
      'PATCH /usuarios/u-ana': () =>
        errorApi(
          409,
          'ULTIMO_ADMINISTRADOR',
          'No se puede dejar el sistema sin administradores activos.',
        ),
    });
    const dialogo = await abrirEdicion(usuario);
    await usuario.selectOptions(within(dialogo).getByLabelText('Rol'), 'digitador');

    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'sin administradores activos',
    );
  });
});

describe('acciones sobre un usuario', () => {
  const elegirAccion = async (
    usuario: ReturnType<typeof renderizarApp>['usuario'],
    nombre: string,
    accion: string,
  ) => {
    const fila = await filaDe(nombre);
    await usuario.click(within(fila).getByText('Más acciones'));
    await usuario.click(within(fila).getByRole('button', { name: accion }));
  };

  it('desactivar pide confirmación; cancelar no hace nada', async () => {
    const { api, usuario } = abrirUsuarios([usuarioFalso()]);

    await elegirAccion(usuario, 'Ana Pérez', 'Desactivar');
    const dialogo = await screen.findByRole('dialog', { name: 'Desactivar usuario' });
    expect(dialogo).toHaveTextContent('No se borra nada');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.de('POST', '/usuarios/u-ana/desactivar')).toHaveLength(0);
  });

  it('desactivar confirmado llama a la API y avisa', async () => {
    const { api, usuario } = abrirUsuarios([usuarioFalso()], {
      'POST /usuarios/u-ana/desactivar': () => ({
        cuerpo: { usuario: usuarioFalso({ activo: false }) },
      }),
    });

    await elegirAccion(usuario, 'Ana Pérez', 'Desactivar');
    const dialogo = await screen.findByRole('dialog', { name: 'Desactivar usuario' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Desactivar' }));

    expect(await screen.findByText('Ana Pérez fue desactivado.')).toBeInTheDocument();
    expect(api.de('POST', '/usuarios/u-ana/desactivar')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('un error al desactivar se muestra dentro del diálogo, que sigue abierto', async () => {
    const { usuario } = abrirUsuarios([usuarioFalso()], {
      'POST /usuarios/u-ana/desactivar': () =>
        errorApi(
          409,
          'ULTIMO_ADMINISTRADOR',
          'No se puede dejar el sistema sin administradores activos.',
        ),
    });

    await elegirAccion(usuario, 'Ana Pérez', 'Desactivar');
    const dialogo = await screen.findByRole('dialog', { name: 'Desactivar usuario' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Desactivar' }));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'sin administradores activos',
    );
    expect(screen.getByRole('dialog', { name: 'Desactivar usuario' })).toBeInTheDocument();
  });

  it('nadie ve la opción de desactivarse a sí mismo', async () => {
    const { usuario } = abrirUsuarios([MIO, usuarioFalso()]);

    const propia = await filaDe('Persona administrador');
    await usuario.click(within(propia).getByText('Más acciones'));

    expect(within(propia).queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument();
    expect(
      within(propia).getByRole('button', { name: 'Restablecer contraseña' }),
    ).toBeInTheDocument();
    const otra = await filaDe('Ana Pérez');
    await usuario.click(within(otra).getByText('Más acciones'));
    expect(within(otra).getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
  });

  it('reactivar actúa de inmediato y avisa', async () => {
    const { api, usuario } = abrirUsuarios([usuarioFalso({ activo: false })], {
      'POST /usuarios/u-ana/reactivar': () => ({ cuerpo: { usuario: usuarioFalso() } }),
    });

    await elegirAccion(usuario, 'Ana Pérez', 'Reactivar');

    expect(await screen.findByText('Ana Pérez fue reactivado.')).toBeInTheDocument();
    expect(api.de('POST', '/usuarios/u-ana/reactivar')).toHaveLength(1);
  });

  it('restablecer contraseña confirma y muestra la nueva contraseña temporal', async () => {
    const { usuario } = abrirUsuarios([usuarioFalso()], {
      'POST /usuarios/u-ana/restablecer-contrasena': () => ({
        cuerpo: {
          usuario: usuarioFalso({ debeCambiarContrasena: true }),
          contrasenaTemporal: 'Nueva9876Clave5432',
        },
      }),
    });

    await elegirAccion(usuario, 'Ana Pérez', 'Restablecer contraseña');
    const confirmar = await screen.findByRole('dialog', { name: 'Restablecer contraseña' });
    await usuario.click(within(confirmar).getByRole('button', { name: 'Restablecer' }));

    const resultado = await screen.findByRole('dialog', { name: 'Contraseña restablecida' });
    expect(within(resultado).getByText('Nueva9876Clave5432')).toBeInTheDocument();
    expect(within(resultado).getByText('ana')).toBeInTheDocument();
  });

  it('reiniciar la verificación en dos pasos confirma y avisa', async () => {
    const { api, usuario } = abrirUsuarios([usuarioFalso()], {
      'POST /usuarios/u-ana/reiniciar-2fa': () => ({ cuerpo: { ok: true } }),
    });

    await elegirAccion(usuario, 'Ana Pérez', 'Reiniciar verificación en dos pasos');
    const dialogo = await screen.findByRole('dialog', {
      name: 'Reiniciar verificación en dos pasos',
    });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Reiniciar' }));

    expect(
      await screen.findByText(/Se reinició la verificación en dos pasos de Ana Pérez/),
    ).toBeInTheDocument();
    expect(api.de('POST', '/usuarios/u-ana/reiniciar-2fa')).toHaveLength(1);
  });

  it.each([
    [2, 'Se cerraron 2 sesión(es) de Ana Pérez.'],
    [0, 'Ana Pérez no tenía sesiones abiertas.'],
  ])('cerrar sesiones (%i cerradas) avisa el resultado', async (cantidad, mensaje) => {
    const { usuario } = abrirUsuarios([usuarioFalso()], {
      'POST /usuarios/u-ana/cerrar-sesiones': () => ({ cuerpo: { sesionesCerradas: cantidad } }),
    });

    await elegirAccion(usuario, 'Ana Pérez', 'Cerrar sus sesiones');
    const dialogo = await screen.findByRole('dialog', { name: 'Cerrar sesiones' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cerrar sesiones' }));

    expect(await screen.findByText(mensaje)).toBeInTheDocument();
  });
});
