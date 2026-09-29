import { randomUUID } from 'node:crypto';

import { permisosDeRol } from '@cambios-jc/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  CLAVE_CIFRADO_PRUEBAS,
  cerrarApp,
  crearAppPrueba,
  type OpcionesAppPrueba,
} from '../../../test/ayudas.js';
import {
  aTexto,
  asegurarEmpresa,
  codigoDe,
  codigoIncorrecto,
  conSesion,
  crearUsuarioDePrueba,
  cuerpoError,
  iniciarSesion,
  publicar,
  tokenDe,
} from '../../../test/auth.js';
import { descifrar, leerClave } from '../../lib/cifrado.js';
import { verificarContrasena } from '../../lib/contrasenas.js';
import { crearPrisma, type PrismaClient } from '../../lib/prisma.js';

let prisma: PrismaClient;
let app: FastifyInstance | undefined;

beforeAll(async () => {
  prisma = crearPrisma();
  await asegurarEmpresa(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  await cerrarApp(app);
  app = undefined;
});

/** App con la autenticación real (cookie + base de datos). */
function nuevaApp(config?: OpcionesAppPrueba['config']): FastifyInstance {
  app = crearAppPrueba({ sesionReal: true, prisma: crearPrisma(), ...(config ? { config } : {}) });
  return app;
}

/** TypeScript no sabe que un valor que la prueba ya comprobó existe; esto lo hace explícito. */
function presente<T>(valor: T | null | undefined, nombre = 'valor'): T {
  if (valor === null || valor === undefined) throw new Error(`Se esperaba ${nombre} y no está.`);
  return valor;
}

const usuarioEnBase = (id: string) => prisma.usuario.findUniqueOrThrow({ where: { id } });

describe('flujo de acceso completo', () => {
  it('contraseña temporal → 2FA → sesión completa → /auth/yo → cerrar sesión', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, {
      rol: 'vendedor',
      debeCambiarContrasena: true,
    });
    const api = nuevaApp();

    // Paso 1: usuario y contraseña. La contraseña temporal obliga a cambiarla.
    const login = await iniciarSesion(api, usuario.login, usuario.contrasena);
    expect(login.statusCode).toBe(200);
    expect(login.json()).toEqual({
      siguientePaso: 'cambiar_contrasena',
      nombre: 'Usuario de prueba',
    });
    const tokenParcial = presente(tokenDe(login), 'la cookie de sesión');

    // La sesión parcial no abre el resto de la API.
    const yoParcial = await api.inject({
      method: 'GET',
      url: '/auth/yo',
      headers: conSesion(tokenParcial),
    });
    expect(yoParcial.statusCode).toBe(401);
    expect(cuerpoError(yoParcial).codigo).toBe('SESION_INCOMPLETA');

    // Antes de cambiar la contraseña no se puede pasar al 2FA.
    const adelantado = await publicar(api, '/auth/2fa/configurar', tokenParcial);
    expect(adelantado.statusCode).toBe(409);
    expect(cuerpoError(adelantado).codigo).toBe('ESTADO_INVALIDO');

    // Paso 2: cambio de la contraseña temporal.
    const nueva = `nueva-${randomUUID()}`;
    const cambio = await publicar(api, '/auth/contrasena/cambiar', tokenParcial, {
      contrasenaActual: usuario.contrasena,
      contrasenaNueva: nueva,
    });
    expect(cambio.statusCode).toBe(200);
    expect(cambio.json()).toEqual({ siguientePaso: 'configurar_2fa' });
    const trasCambio = await usuarioEnBase(usuario.id);
    expect(trasCambio.debeCambiarContrasena).toBe(false);
    expect(await verificarContrasena(trasCambio.hashContrasena, nueva)).toBe(true);

    // Paso 3: QR y secreto. El secreto queda cifrado en la base, nunca en claro.
    const configurar = await publicar(api, '/auth/2fa/configurar', tokenParcial);
    expect(configurar.statusCode).toBe(200);
    const { secreto, otpauthUrl, qr } = configurar.json<{
      secreto: string;
      otpauthUrl: string;
      qr: string;
    }>();
    expect(otpauthUrl.startsWith('otpauth://totp/')).toBe(true);
    expect(otpauthUrl).toContain(secreto);
    expect(qr.startsWith('data:image/png;base64,')).toBe(true);
    const conSecreto = await usuarioEnBase(usuario.id);
    const cifrado = presente(conSecreto.secreto2fa, 'el secreto cifrado');
    expect(cifrado).not.toContain(secreto);
    expect(descifrar(cifrado, leerClave(CLAVE_CIFRADO_PRUEBAS))).toBe(secreto);
    expect(conSecreto.tiene2fa).toBe(false);

    // Un código incorrecto no activa el 2FA.
    const malo = await publicar(api, '/auth/2fa/activar', tokenParcial, {
      codigo: await codigoIncorrecto(secreto),
    });
    expect(malo.statusCode).toBe(401);
    expect(cuerpoError(malo).codigo).toBe('CODIGO_INVALIDO');
    expect((await usuarioEnBase(usuario.id)).tiene2fa).toBe(false);

    // Paso 4: con el código correcto se activa y la sesión queda completa.
    const activar = await publicar(api, '/auth/2fa/activar', tokenParcial, {
      codigo: await codigoDe(secreto),
    });
    expect(activar.statusCode).toBe(200);
    expect(activar.json<{ usuario: { rol: string } }>().usuario.rol).toBe('vendedor');
    const tokenCompleto = presente(tokenDe(activar), 'la cookie de sesión completa');
    expect(tokenCompleto).not.toBe(tokenParcial);
    const activado = await usuarioEnBase(usuario.id);
    expect(activado.tiene2fa).toBe(true);
    expect(activado.intentosFallidos).toBe(0);
    expect(activado.ultimoAcceso).not.toBeNull();

    // El token parcial ya no sirve (se emitió uno nuevo al completar).
    const viejo = await api.inject({
      method: 'GET',
      url: '/auth/yo',
      headers: conSesion(tokenParcial),
    });
    expect(viejo.statusCode).toBe(401);

    // /auth/yo con la sesión completa.
    const yo = await api.inject({
      method: 'GET',
      url: '/auth/yo',
      headers: conSesion(tokenCompleto),
    });
    expect(yo.statusCode).toBe(200);
    const cuerpo = yo.json<{
      usuario: { id: string; login: string; rol: string };
      permisos: string[];
      empresa: { nombre: string } | null;
    }>();
    expect(cuerpo.usuario).toMatchObject({ id: usuario.id, login: usuario.login, rol: 'vendedor' });
    expect(cuerpo.permisos).toEqual([...permisosDeRol('vendedor')]);
    expect(presente(cuerpo.empresa, 'los datos de la empresa').nombre).toBeTruthy();
    expect(yo.body).not.toMatch(/hash|secreto|contrasena/i);

    // Cerrar sesión: la cookie se borra y el token deja de servir.
    const salir = await publicar(api, '/auth/logout', tokenCompleto);
    expect(salir.statusCode).toBe(200);
    expect(salir.json()).toEqual({ ok: true });
    expect(tokenDe(salir)).toBe('');
    const despues = await api.inject({
      method: 'GET',
      url: '/auth/yo',
      headers: conSesion(tokenCompleto),
    });
    expect(despues.statusCode).toBe(401);

    // El siguiente acceso ya no pide cambiar la contraseña ni el QR: solo el código.
    const otro = await iniciarSesion(api, usuario.login, nueva);
    expect(otro.json<{ siguientePaso: string }>().siguientePaso).toBe('verificar_2fa');

    // Todo quedó en la bitácora, sin contraseñas, secretos, códigos ni tokens.
    const filas = await prisma.auditoria.findMany({
      where: { usuarioId: usuario.id },
      orderBy: { id: 'asc' },
    });
    expect(filas.map((fila) => fila.accion)).toEqual(
      expect.arrayContaining([
        'auth.contrasena_correcta',
        'usuario.cambiar_contrasena',
        'auth.2fa_configurar',
        'auth.2fa_fallido',
        'auth.2fa_activar',
        'auth.login',
        'auth.logout',
      ]),
    );
    const bitacora = aTexto(filas);
    for (const secretoDePrueba of [
      usuario.contrasena,
      nueva,
      secreto,
      cifrado,
      tokenParcial,
      tokenCompleto,
    ]) {
      expect(bitacora).not.toContain(secretoDePrueba);
    }
  });

  it('un usuario con 2FA solo pasa por contraseña y código', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { con2fa: true });
    const api = nuevaApp();

    const login = await iniciarSesion(api, usuario.login, usuario.contrasena);
    expect(login.json<{ siguientePaso: string }>().siguientePaso).toBe('verificar_2fa');
    const tokenParcial = presente(tokenDe(login));

    const verificar = await publicar(api, '/auth/2fa/verificar', tokenParcial, {
      codigo: await codigoDe(presente(usuario.secreto)),
    });
    expect(verificar.statusCode).toBe(200);
    const tokenCompleto = presente(tokenDe(verificar));

    const yo = await api.inject({
      method: 'GET',
      url: '/auth/yo',
      headers: conSesion(tokenCompleto),
    });
    expect(yo.statusCode).toBe(200);
  });

  it('una sesión completa no puede volver a las rutas del 2FA', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { con2fa: true });
    const api = nuevaApp();
    const parcial = presente(tokenDe(await iniciarSesion(api, usuario.login, usuario.contrasena)));
    const completa = presente(
      tokenDe(
        await publicar(api, '/auth/2fa/verificar', parcial, {
          codigo: await codigoDe(presente(usuario.secreto)),
        }),
      ),
    );

    const otraVez = await publicar(api, '/auth/2fa/verificar', completa, { codigo: '123456' });

    expect(otraVez.statusCode).toBe(409);
    expect(cuerpoError(otraVez).codigo).toBe('ESTADO_INVALIDO');
  });

  it('verificar 2FA sin haber cambiado la contraseña temporal es rechazado', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, {
      con2fa: true,
      debeCambiarContrasena: true,
    });
    const api = nuevaApp();
    const parcial = presente(tokenDe(await iniciarSesion(api, usuario.login, usuario.contrasena)));

    const respuesta = await publicar(api, '/auth/2fa/verificar', parcial, {
      codigo: await codigoDe(presente(usuario.secreto)),
    });

    expect(respuesta.statusCode).toBe(409);
  });
});

describe('credenciales', () => {
  it('usuario inexistente, desactivado y contraseña errada responden exactamente lo mismo', async () => {
    const activo = await crearUsuarioDePrueba(prisma);
    const desactivado = await crearUsuarioDePrueba(prisma, { activo: false });
    const api = nuevaApp();

    const respuestas = await Promise.all([
      iniciarSesion(api, `no-existe-${randomUUID().slice(0, 8)}`, 'lo-que-sea-123'),
      iniciarSesion(api, desactivado.login, desactivado.contrasena),
      iniciarSesion(api, activo.login, 'contrasena-equivocada'),
    ]);

    for (const respuesta of respuestas) {
      expect(respuesta.statusCode).toBe(401);
      expect(tokenDe(respuesta)).toBeUndefined();
    }
    const [primera, ...resto] = respuestas.map((respuesta) => respuesta.json<unknown>());
    for (const cuerpo of resto) expect(cuerpo).toEqual(primera);
    expect(cuerpoError(presente(respuestas[0])).codigo).toBe('CREDENCIALES_INVALIDAS');
  });

  it('registra los intentos fallidos en la bitácora, también los de usuarios que no existen', async () => {
    const inexistente = `no-existe-${randomUUID().slice(0, 8)}`;
    const usuario = await crearUsuarioDePrueba(prisma);
    const api = nuevaApp();

    await iniciarSesion(api, inexistente, 'lo-que-sea-123');
    await iniciarSesion(api, usuario.login, 'contrasena-equivocada');

    const deInexistente = await prisma.auditoria.findFirst({
      where: { accion: 'auth.login_fallido', despues: { path: ['login'], equals: inexistente } },
    });
    expect(deInexistente?.usuarioId).toBeNull();
    const deUsuario = await prisma.auditoria.findFirst({
      where: { accion: 'auth.login_fallido', usuarioId: usuario.id },
    });
    expect(deUsuario).not.toBeNull();
    expect(aTexto(deUsuario)).not.toContain('contrasena-equivocada');
  });

  it('rechaza datos incompletos sin contar como intento fallido', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    const api = nuevaApp();

    const sinContrasena = await api.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: usuario.login },
    });

    expect(sinContrasena.statusCode).toBe(400);
    expect(cuerpoError(sinContrasena).codigo).toBe('VALIDACION_FALLIDA');
    expect((await usuarioEnBase(usuario.id)).intentosFallidos).toBe(0);
  });
});

describe('cambio de la contraseña temporal', () => {
  async function conSesionParcial() {
    const usuario = await crearUsuarioDePrueba(prisma, { debeCambiarContrasena: true });
    const api = nuevaApp();
    const token = presente(tokenDe(await iniciarSesion(api, usuario.login, usuario.contrasena)));
    return { usuario, api, token };
  }

  it('rechaza una contraseña nueva de menos de 10 caracteres', async () => {
    const { usuario, api, token } = await conSesionParcial();

    const respuesta = await publicar(api, '/auth/contrasena/cambiar', token, {
      contrasenaActual: usuario.contrasena,
      contrasenaNueva: 'corta123',
    });

    expect(respuesta.statusCode).toBe(400);
    const detalles = cuerpoError(respuesta).detalles as { campo: string; mensaje: string }[];
    expect(detalles[0]).toMatchObject({
      campo: 'contrasenaNueva',
      mensaje: 'La contraseña debe tener al menos 10 caracteres.',
    });
  });

  it('rechaza una contraseña nueva igual a la actual', async () => {
    const { usuario, api, token } = await conSesionParcial();

    const respuesta = await publicar(api, '/auth/contrasena/cambiar', token, {
      contrasenaActual: usuario.contrasena,
      contrasenaNueva: usuario.contrasena,
    });

    expect(respuesta.statusCode).toBe(400);
    expect(JSON.stringify(cuerpoError(respuesta).detalles)).toContain('distinta de la actual');
    expect((await usuarioEnBase(usuario.id)).debeCambiarContrasena).toBe(true);
  });

  it('una contraseña actual errada cuenta como intento fallido', async () => {
    const { usuario, api, token } = await conSesionParcial();

    const respuesta = await publicar(api, '/auth/contrasena/cambiar', token, {
      contrasenaActual: 'no-es-la-actual-123',
      contrasenaNueva: `nueva-${randomUUID()}`,
    });

    expect(respuesta.statusCode).toBe(401);
    const enBase = await usuarioEnBase(usuario.id);
    expect(enBase.intentosFallidos).toBe(1);
    expect(enBase.debeCambiarContrasena).toBe(true);
  });

  it('si la contraseña no está pendiente de cambio, no se puede cambiar desde la sesión parcial', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { con2fa: true });
    const api = nuevaApp();
    const token = presente(tokenDe(await iniciarSesion(api, usuario.login, usuario.contrasena)));

    const respuesta = await publicar(api, '/auth/contrasena/cambiar', token, {
      contrasenaActual: usuario.contrasena,
      contrasenaNueva: `nueva-${randomUUID()}`,
    });

    expect(respuesta.statusCode).toBe(409);
  });
});

describe('código de la aplicación autenticadora', () => {
  it('un código con formato inválido responde 400 y no cuenta como intento', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { con2fa: true });
    const api = nuevaApp();
    const token = presente(tokenDe(await iniciarSesion(api, usuario.login, usuario.contrasena)));

    for (const codigo of ['12345', 'abcdef', '1234567', '']) {
      const respuesta = await publicar(api, '/auth/2fa/verificar', token, { codigo });
      expect(respuesta.statusCode, codigo).toBe(400);
    }

    expect((await usuarioEnBase(usuario.id)).intentosFallidos).toBe(0);
  });

  it('un mismo código no se puede usar dos veces, pero el del paso siguiente sí', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { con2fa: true });
    const secreto = presente(usuario.secreto);
    const api = nuevaApp();
    const codigo = await codigoDe(secreto);

    const primera = await publicar(
      api,
      '/auth/2fa/verificar',
      tokenDe(await iniciarSesion(api, usuario.login, usuario.contrasena)),
      { codigo },
    );
    expect(primera.statusCode).toBe(200);

    // Alguien que vio el código intenta reutilizarlo en un nuevo acceso.
    const reutilizado = await publicar(
      api,
      '/auth/2fa/verificar',
      tokenDe(await iniciarSesion(api, usuario.login, usuario.contrasena)),
      { codigo },
    );
    expect(reutilizado.statusCode).toBe(401);
    expect(cuerpoError(reutilizado).codigo).toBe('CODIGO_INVALIDO');

    const siguiente = await publicar(
      api,
      '/auth/2fa/verificar',
      tokenDe(await iniciarSesion(api, usuario.login, usuario.contrasena)),
      { codigo: await codigoDe(secreto, 30) },
    );
    expect(siguiente.statusCode).toBe(200);
  });
});

describe('bloqueo tras intentos fallidos', () => {
  it('5 contraseñas incorrectas bloquean la cuenta, incluso con la contraseña correcta', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    const api = nuevaApp();

    const estados: number[] = [];
    for (let i = 0; i < 5; i++) {
      estados.push((await iniciarSesion(api, usuario.login, `mal-${String(i)}`)).statusCode);
    }
    const conLaCorrecta = await iniciarSesion(api, usuario.login, usuario.contrasena);

    expect(estados).toEqual([401, 401, 401, 401, 403]);
    expect(conLaCorrecta.statusCode).toBe(403);
    expect(cuerpoError(conLaCorrecta).codigo).toBe('CUENTA_BLOQUEADA');
    expect(cuerpoError(conLaCorrecta).detalles).toEqual({ minutosRestantes: 15 });
    expect(tokenDe(conLaCorrecta)).toBeUndefined();
    const enBase = await usuarioEnBase(usuario.id);
    expect(enBase.bloqueadoHasta).not.toBeNull();
    const acciones = (await prisma.auditoria.findMany({ where: { usuarioId: usuario.id } })).map(
      (fila) => fila.accion,
    );
    expect(acciones).toContain('auth.cuenta_bloqueada');
  });

  it('el bloqueo termina cuando pasa el tiempo', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    const api = nuevaApp();
    for (let i = 0; i < 5; i++) await iniciarSesion(api, usuario.login, `mal-${String(i)}`);
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { bloqueadoHasta: new Date(Date.now() - 1000) },
    });

    const respuesta = await iniciarSesion(api, usuario.login, usuario.contrasena);

    expect(respuesta.statusCode).toBe(200);
  });

  it('5 códigos incorrectos bloquean la cuenta y cierran la sesión parcial', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { con2fa: true });
    const secreto = presente(usuario.secreto);
    const api = nuevaApp();
    const token = presente(tokenDe(await iniciarSesion(api, usuario.login, usuario.contrasena)));

    const estados: number[] = [];
    for (let i = 0; i < 5; i++) {
      const codigo = await codigoIncorrecto(secreto);
      estados.push((await publicar(api, '/auth/2fa/verificar', token, { codigo })).statusCode);
    }
    // Ni siquiera el código correcto sirve: la sesión parcial fue revocada.
    const conElCorrecto = await publicar(api, '/auth/2fa/verificar', token, {
      codigo: await codigoDe(secreto),
    });

    expect(estados).toEqual([401, 401, 401, 401, 403]);
    expect(conElCorrecto.statusCode).toBe(401);
    const bloqueada = await iniciarSesion(api, usuario.login, usuario.contrasena);
    expect(cuerpoError(bloqueada).codigo).toBe('CUENTA_BLOQUEADA');
  });

  it('un acceso completo reinicia el contador de fallos', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { con2fa: true });
    const api = nuevaApp();
    await iniciarSesion(api, usuario.login, 'mal-1');
    await iniciarSesion(api, usuario.login, 'mal-2');
    expect((await usuarioEnBase(usuario.id)).intentosFallidos).toBe(2);

    const token = presente(tokenDe(await iniciarSesion(api, usuario.login, usuario.contrasena)));
    await publicar(api, '/auth/2fa/verificar', token, {
      codigo: await codigoDe(presente(usuario.secreto)),
    });

    expect((await usuarioEnBase(usuario.id)).intentosFallidos).toBe(0);
  });

  it('respeta el máximo de intentos configurado', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    const api = nuevaApp({ LOGIN_INTENTOS_MAXIMOS: 2, LOGIN_BLOQUEO_MINUTOS: 3 });

    const primero = await iniciarSesion(api, usuario.login, 'mal-1');
    const segundo = await iniciarSesion(api, usuario.login, 'mal-2');

    expect(primero.statusCode).toBe(401);
    expect(segundo.statusCode).toBe(403);
    expect(cuerpoError(segundo).detalles).toEqual({ minutosRestantes: 3 });
  });
});

describe('cookie de sesión', () => {
  it('es httpOnly y SameSite=Strict; Secure solo en producción', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);

    const enDesarrollo = await iniciarSesion(nuevaApp(), usuario.login, usuario.contrasena);
    const cookieDesarrollo = String(enDesarrollo.headers['set-cookie']);
    expect(cookieDesarrollo).toMatch(/HttpOnly/i);
    expect(cookieDesarrollo).toMatch(/SameSite=Strict/i);
    expect(cookieDesarrollo).toMatch(/Path=\//i);
    expect(cookieDesarrollo).not.toMatch(/Secure/i);
    await cerrarApp(app);

    const enProduccion = await iniciarSesion(
      nuevaApp({ NODE_ENV: 'production' }),
      usuario.login,
      usuario.contrasena,
    );
    expect(String(enProduccion.headers['set-cookie'])).toMatch(/Secure/i);
  });

  it('el token nunca se guarda en la base: solo su hash', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    const token = presente(
      tokenDe(await iniciarSesion(nuevaApp(), usuario.login, usuario.contrasena)),
    );

    const sesiones = await prisma.sesion.findMany({ where: { usuarioId: usuario.id } });

    expect(sesiones).toHaveLength(1);
    expect(sesiones[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(sesiones)).not.toContain(token);
  });
});

describe('límite de peticiones en /auth', () => {
  it('a partir de la petición 11 en un minuto responde 429', async () => {
    const api = nuevaApp();

    const estados: number[] = [];
    for (let i = 0; i < 11; i++) {
      estados.push(
        (await iniciarSesion(api, `no-existe-${String(i)}`, 'lo-que-sea-123')).statusCode,
      );
    }

    expect(estados.slice(0, 10)).toEqual(Array<number>(10).fill(401));
    expect(estados[10]).toBe(429);
  });
});

describe('cierre de sesión', () => {
  it('es idempotente: cerrar una sesión inexistente o sin cookie no falla', async () => {
    const api = nuevaApp();

    const sinCookie = await publicar(api, '/auth/logout', undefined);
    const conBasura = await publicar(api, '/auth/logout', 'token-que-no-existe');

    expect(sinCookie.statusCode).toBe(200);
    expect(conBasura.statusCode).toBe(200);
  });
});
