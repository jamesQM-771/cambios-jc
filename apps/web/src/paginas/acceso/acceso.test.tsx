import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  errorApi,
  sesionFalsa,
  simularApi,
  sinSesion,
  type RespuestaFalsa,
} from '../../pruebas/api-falsa.js';
import { renderizarApp } from '../../pruebas/renderizar.js';

const SIN_LOGO = errorApi(404, 'NO_ENCONTRADO', 'La empresa no tiene logo.');
const USUARIO = { id: 'id-1', nombre: 'Ana Pérez', login: 'ana', rol: 'administrador' };
const CONFIGURACION_2FA = {
  secreto: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  otpauthUrl: 'otpauth://totp/Cambios%20JC:ana?secret=JBSWY3DPEHPK3PXP',
  qr: 'data:image/png;base64,iVBORw0KGgo=',
};

/** Rutas de una API donde la sesión se vuelve completa cuando se llama a `abrirSesion`. */
function apiConSesion(extra: Record<string, () => RespuestaFalsa>) {
  let completa = false;
  const api = simularApi({
    'GET /auth/yo': () => (completa ? { cuerpo: sesionFalsa('administrador') } : sinSesion()),
    'GET /empresa/logo': SIN_LOGO,
    ...extra,
  });
  return { api, abrirSesion: () => (completa = true) };
}

const escribir = async (
  usuario: ReturnType<typeof renderizarApp>['usuario'],
  etiqueta: string | RegExp,
  texto: string,
) => {
  await usuario.type(await screen.findByLabelText(etiqueta), texto);
};

describe('inicio de sesión', () => {
  it('muestra el formulario y no deja enviar mientras falten datos', async () => {
    simularApi({ 'GET /auth/yo': sinSesion(), 'GET /empresa/logo': SIN_LOGO });
    const { usuario } = renderizarApp('/acceso');

    const boton = await screen.findByRole('button', { name: 'Continuar' });
    expect(boton).toBeDisabled();
    await escribir(usuario, 'Usuario', 'ana');
    expect(boton).toBeDisabled();
    await escribir(usuario, 'Contraseña', 'secreta');
    expect(boton).toBeEnabled();
  });

  it('una contraseña incorrecta muestra el mensaje del servidor y vacía la contraseña', async () => {
    simularApi({
      'GET /auth/yo': sinSesion(),
      'GET /empresa/logo': SIN_LOGO,
      'POST /auth/login': errorApi(
        401,
        'CREDENCIALES_INVALIDAS',
        'Usuario o contraseña incorrectos.',
      ),
    });
    const { usuario } = renderizarApp('/acceso');
    await escribir(usuario, 'Usuario', 'ana');
    await escribir(usuario, 'Contraseña', 'incorrecta');

    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos.');
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
    expect(screen.getByLabelText('Usuario')).toHaveValue('ana');
  });

  it('una cuenta bloqueada dice cuántos minutos faltan', async () => {
    simularApi({
      'GET /auth/yo': sinSesion(),
      'GET /empresa/logo': SIN_LOGO,
      'POST /auth/login': errorApi(
        403,
        'CUENTA_BLOQUEADA',
        'Cuenta bloqueada temporalmente. Inténtalo de nuevo en 15 minuto(s).',
        { minutosRestantes: 15 },
      ),
    });
    const { usuario } = renderizarApp('/acceso');
    await escribir(usuario, 'Usuario', 'ana');
    await escribir(usuario, 'Contraseña', 'algo');

    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cuenta bloqueada temporalmente');
    expect(screen.getByRole('alert')).toHaveTextContent('15 minuto(s)');
  });

  it('si el servidor no responde, avisa que no hay conexión', async () => {
    simularApi({
      'GET /auth/yo': sinSesion(),
      'GET /empresa/logo': SIN_LOGO,
      'POST /auth/login': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const { usuario } = renderizarApp('/acceso');
    await escribir(usuario, 'Usuario', 'ana');
    await escribir(usuario, 'Contraseña', 'algo');

    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo conectar con el servidor',
    );
  });

  it('quien ya tiene sesión completa no ve el acceso: pasa al sistema', async () => {
    simularApi({ 'GET /auth/yo': { cuerpo: sesionFalsa('administrador') } });

    renderizarApp('/acceso');

    expect(await screen.findByRole('heading', { name: /Hola/ })).toBeInTheDocument();
  });
});

describe('primer acceso: contraseña temporal y 2FA', () => {
  it('recorre cambiar la contraseña, configurar el 2FA y entra al sistema', async () => {
    const { api, abrirSesion } = apiConSesion({
      'POST /auth/login': () => ({
        cuerpo: { siguientePaso: 'cambiar_contrasena', nombre: 'Ana Pérez' },
      }),
      'POST /auth/contrasena/cambiar': () => ({ cuerpo: { siguientePaso: 'configurar_2fa' } }),
      'POST /auth/2fa/configurar': () => ({ cuerpo: CONFIGURACION_2FA }),
      'POST /auth/2fa/activar': () => {
        abrirSesion();
        return { cuerpo: { usuario: USUARIO } };
      },
    });
    const { usuario } = renderizarApp('/acceso');

    // 1. Usuario y contraseña
    await escribir(usuario, 'Usuario', 'ana');
    await escribir(usuario, 'Contraseña', 'Temporal123456');
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));

    // 2. Cambio de la contraseña temporal
    expect(
      await screen.findByRole('heading', { name: 'Cambia tu contraseña' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Hola, Ana Pérez/)).toBeInTheDocument();
    await escribir(usuario, 'Contraseña temporal', 'Temporal123456');
    await escribir(usuario, 'Contraseña nueva', 'MiClaveNueva-2026');
    await escribir(usuario, 'Repite la contraseña nueva', 'MiClaveNueva-2026');
    await usuario.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    // 3. Configurar el 2FA: QR, secreto y la indicación de varios teléfonos
    expect(
      await screen.findByRole('heading', { name: 'Configura la verificación en dos pasos' }),
    ).toBeInTheDocument();
    expect(screen.getByAltText('Código QR para la aplicación autenticadora')).toHaveAttribute(
      'src',
      CONFIGURACION_2FA.qr,
    );
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')).toBeInTheDocument();
    expect(screen.getByText(/todos los teléfonos que quieras usar/)).toBeInTheDocument();
    await escribir(usuario, 'Código de 6 dígitos', '123456');
    await usuario.click(screen.getByRole('button', { name: 'Activar y entrar' }));

    // 4. Dentro del sistema
    expect(
      await screen.findByRole('heading', { name: /Hola, Persona administrador/ }),
    ).toBeInTheDocument();
    expect(api.de('POST', '/auth/login')[0]?.cuerpo).toEqual({
      login: 'ana',
      contrasena: 'Temporal123456',
    });
    expect(api.de('POST', '/auth/contrasena/cambiar')[0]?.cuerpo).toEqual({
      contrasenaActual: 'Temporal123456',
      contrasenaNueva: 'MiClaveNueva-2026',
    });
    expect(api.de('POST', '/auth/2fa/activar')[0]?.cuerpo).toEqual({ codigo: '123456' });
    // El secreto se pidió una sola vez, aunque React ejecute los efectos dos veces en desarrollo.
    expect(api.de('POST', '/auth/2fa/configurar')).toHaveLength(1);
  });

  it('no deja cambiar la contraseña si es corta, igual a la temporal o no coincide', async () => {
    const { api } = apiConSesion({
      'POST /auth/login': () => ({
        cuerpo: { siguientePaso: 'cambiar_contrasena', nombre: 'Ana' },
      }),
      'POST /auth/contrasena/cambiar': () => ({ cuerpo: { siguientePaso: 'configurar_2fa' } }),
    });
    const { usuario } = renderizarApp('/acceso');
    await escribir(usuario, 'Usuario', 'ana');
    await escribir(usuario, 'Contraseña', 'Temporal123456');
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('heading', { name: 'Cambia tu contraseña' });
    await escribir(usuario, 'Contraseña temporal', 'Temporal123456');
    const enviar = screen.getByRole('button', { name: 'Cambiar contraseña' });

    // Corta
    await escribir(usuario, 'Contraseña nueva', 'corta');
    await usuario.click(enviar);
    expect(await screen.findByText('Debe tener al menos 10 caracteres.')).toBeInTheDocument();

    // Igual a la temporal
    await usuario.clear(screen.getByLabelText('Contraseña nueva'));
    await escribir(usuario, 'Contraseña nueva', 'Temporal123456');
    await escribir(usuario, 'Repite la contraseña nueva', 'Temporal123456');
    await usuario.click(enviar);
    expect(
      await screen.findByText('La contraseña nueva debe ser distinta de la temporal.'),
    ).toBeInTheDocument();

    // No coinciden
    await usuario.clear(screen.getByLabelText('Contraseña nueva'));
    await escribir(usuario, 'Contraseña nueva', 'MiClaveNueva-2026');
    await usuario.click(enviar);
    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();

    expect(api.de('POST', '/auth/contrasena/cambiar')).toHaveLength(0);
  });

  it('muestra el error por campo que devuelve el servidor', async () => {
    apiConSesion({
      'POST /auth/login': () => ({
        cuerpo: { siguientePaso: 'cambiar_contrasena', nombre: 'Ana' },
      }),
      'POST /auth/contrasena/cambiar': () =>
        errorApi(400, 'VALIDACION_FALLIDA', 'Los datos enviados no son válidos.', [
          { campo: 'contrasenaNueva', mensaje: 'Esa contraseña es demasiado común.' },
        ]),
    });
    const { usuario } = renderizarApp('/acceso');
    await escribir(usuario, 'Usuario', 'ana');
    await escribir(usuario, 'Contraseña', 'Temporal123456');
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('heading', { name: 'Cambia tu contraseña' });
    await escribir(usuario, 'Contraseña temporal', 'Temporal123456');
    await escribir(usuario, 'Contraseña nueva', 'MiClaveNueva-2026');
    await escribir(usuario, 'Repite la contraseña nueva', 'MiClaveNueva-2026');

    await usuario.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText('Esa contraseña es demasiado común.')).toBeInTheDocument();
  });

  it('un código de activación incorrecto muestra el error y vacía el campo', async () => {
    apiConSesion({
      'POST /auth/login': () => ({ cuerpo: { siguientePaso: 'configurar_2fa', nombre: 'Ana' } }),
      'POST /auth/2fa/configurar': () => ({ cuerpo: CONFIGURACION_2FA }),
      'POST /auth/2fa/activar': () => errorApi(401, 'CODIGO_INVALIDO', 'El código no es correcto.'),
    });
    const { usuario } = renderizarApp('/acceso');
    await escribir(usuario, 'Usuario', 'ana');
    await escribir(usuario, 'Contraseña', 'Clave12345678');
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));
    await escribir(usuario, 'Código de 6 dígitos', '000000');

    await usuario.click(screen.getByRole('button', { name: 'Activar y entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El código no es correcto.');
    expect(screen.getByLabelText('Código de 6 dígitos')).toHaveValue('');
  });

  it('el botón de activar espera 6 dígitos y el campo solo acepta números', async () => {
    apiConSesion({
      'POST /auth/login': () => ({ cuerpo: { siguientePaso: 'configurar_2fa', nombre: 'Ana' } }),
      'POST /auth/2fa/configurar': () => ({ cuerpo: CONFIGURACION_2FA }),
    });
    const { usuario } = renderizarApp('/acceso');
    await escribir(usuario, 'Usuario', 'ana');
    await escribir(usuario, 'Contraseña', 'Clave12345678');
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));

    const campo = await screen.findByLabelText('Código de 6 dígitos');
    await usuario.type(campo, '12a3-45');
    expect(campo).toHaveValue('12345');
    expect(screen.getByRole('button', { name: 'Activar y entrar' })).toBeDisabled();
    await usuario.type(campo, '6');
    expect(screen.getByRole('button', { name: 'Activar y entrar' })).toBeEnabled();
  });
});

describe('acceso habitual con 2FA', () => {
  it('pide el código después de la contraseña y entra al sistema', async () => {
    const { api, abrirSesion } = apiConSesion({
      'POST /auth/login': () => ({
        cuerpo: { siguientePaso: 'verificar_2fa', nombre: 'Ana Pérez' },
      }),
      'POST /auth/2fa/verificar': () => {
        abrirSesion();
        return { cuerpo: { usuario: USUARIO } };
      },
    });
    const { usuario } = renderizarApp('/acceso');
    await escribir(usuario, 'Usuario', 'ana');
    await escribir(usuario, 'Contraseña', 'Clave12345678');
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(
      await screen.findByRole('heading', { name: 'Verificación en dos pasos' }),
    ).toBeInTheDocument();
    await escribir(usuario, 'Código de 6 dígitos', '654321');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: /Hola/ })).toBeInTheDocument();
    expect(api.de('POST', '/auth/2fa/verificar')[0]?.cuerpo).toEqual({ codigo: '654321' });
  });

  it('un código incorrecto avisa y deja volver a intentar', async () => {
    apiConSesion({
      'POST /auth/login': () => ({ cuerpo: { siguientePaso: 'verificar_2fa', nombre: 'Ana' } }),
      'POST /auth/2fa/verificar': () =>
        errorApi(401, 'CODIGO_INVALIDO', 'El código no es correcto.'),
    });
    const { usuario } = renderizarApp('/acceso');
    await escribir(usuario, 'Usuario', 'ana');
    await escribir(usuario, 'Contraseña', 'Clave12345678');
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));
    await escribir(usuario, 'Código de 6 dígitos', '111111');

    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El código no es correcto.');
    await escribir(usuario, 'Código de 6 dígitos', '222222');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it('si la sesión de acceso venció mientras se escribía el código, vuelve al inicio con un aviso', async () => {
    apiConSesion({
      'POST /auth/login': () => ({ cuerpo: { siguientePaso: 'verificar_2fa', nombre: 'Ana' } }),
      'POST /auth/2fa/verificar': () => sinSesion(),
    });
    const { usuario } = renderizarApp('/acceso');
    await escribir(usuario, 'Usuario', 'ana');
    await escribir(usuario, 'Contraseña', 'Clave12345678');
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));
    await escribir(usuario, 'Código de 6 dígitos', '123456');

    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Tu acceso venció por inactividad');
  });
});

describe('orden de los pasos', () => {
  it.each(['/acceso/contrasena', '/acceso/2fa/configurar', '/acceso/2fa/verificar'])(
    'abrir %s sin haber puesto la contraseña lleva al inicio del acceso',
    async (ruta) => {
      const api = simularApi({ 'GET /auth/yo': sinSesion(), 'GET /empresa/logo': SIN_LOGO });

      renderizarApp(ruta);

      expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
      // Ni siquiera se llega a pedir el secreto del 2FA.
      expect(api.de('POST', '/auth/2fa/configurar')).toHaveLength(0);
    },
  );

  it('tras la contraseña se abre exactamente el paso que indica el servidor', async () => {
    apiConSesion({
      'POST /auth/login': () => ({ cuerpo: { siguientePaso: 'verificar_2fa', nombre: 'Ana' } }),
    });
    const { usuario } = renderizarApp('/acceso');
    await escribir(usuario, 'Usuario', 'ana');
    await escribir(usuario, 'Contraseña', 'Clave12345678');
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('heading', { name: 'Verificación en dos pasos' });

    await waitFor(() => {
      expect(screen.getByLabelText('Código de 6 dígitos')).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Cambia tu contraseña' })).not.toBeInTheDocument();
  });
});
