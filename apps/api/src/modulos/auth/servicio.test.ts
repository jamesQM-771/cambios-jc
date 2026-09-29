import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { cerrarApp, configPrueba, crearAppPrueba } from '../../../test/ayudas.js';
import {
  asegurarEmpresa,
  codigoDe,
  conSesion,
  crearUsuarioDePrueba,
  cuerpoError,
  iniciarSesion,
  publicar,
  tokenDe,
} from '../../../test/auth.js';
import { crearPrisma, type PrismaClient } from '../../lib/prisma.js';
import { generarToken, hashToken } from '../../lib/tokens.js';

import { crearServicioAuth } from './servicio.js';

let prisma: PrismaClient;
let app: FastifyInstance | undefined;

const contexto = { ip: '127.0.0.1', agenteUsuario: 'prueba' };
const MINUTO = 60_000;
const HORA = 60 * MINUTO;

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

interface OpcionesSesion {
  completa?: boolean;
  /** Cuánto hace que se creó la sesión. */
  creadaHace?: number;
  /** Cuánto falta para que venza por tiempo máximo (negativo = ya venció). */
  venceEn?: number;
  /** Cuánto hace que hubo actividad. */
  ultimaActividadHace?: number;
  revocada?: boolean;
}

/** Inserta una sesión directamente en la base y devuelve su token, para probar vencimientos. */
async function sesionDirecta(usuarioId: string, opciones: OpcionesSesion = {}): Promise<string> {
  const ahora = Date.now();
  const token = generarToken();
  await prisma.sesion.create({
    data: {
      usuarioId,
      tokenHash: hashToken(token),
      completa: opciones.completa ?? true,
      creadaEn: new Date(ahora - (opciones.creadaHace ?? 0)),
      expiraEn: new Date(ahora + (opciones.venceEn ?? 12 * HORA)),
      ultimaActividad: new Date(ahora - (opciones.ultimaActividadHace ?? 0)),
      revocada: opciones.revocada ?? false,
    },
  });
  return token;
}

function nuevaApp(): FastifyInstance {
  app = crearAppPrueba({ sesionReal: true, prisma: crearPrisma() });
  return app;
}

async function estadoConSesion(token: string): Promise<number> {
  const respuesta = await nuevaApp().inject({
    method: 'GET',
    url: '/auth/yo',
    headers: conSesion(token),
  });
  await cerrarApp(app);
  app = undefined;
  return respuesta.statusCode;
}

describe('vigencia de la sesión', () => {
  it('una sesión completa reciente es válida', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    expect(await estadoConSesion(await sesionDirecta(usuario.id))).toBe(200);
  });

  it('vence por inactividad (más de 30 minutos sin usarla)', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    const token = await sesionDirecta(usuario.id, { ultimaActividadHace: 31 * MINUTO });
    expect(await estadoConSesion(token)).toBe(401);
  });

  it('con actividad reciente sigue válida aunque lleve horas abierta', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    const token = await sesionDirecta(usuario.id, {
      creadaHace: 8 * HORA,
      venceEn: 4 * HORA,
      ultimaActividadHace: 5 * MINUTO,
    });
    expect(await estadoConSesion(token)).toBe(200);
  });

  it('vence por tiempo máximo (12 horas) aunque haya actividad', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    const token = await sesionDirecta(usuario.id, {
      creadaHace: 13 * HORA,
      venceEn: -HORA,
      ultimaActividadHace: MINUTO,
    });
    expect(await estadoConSesion(token)).toBe(401);
  });

  it('una sesión revocada no sirve', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    expect(await estadoConSesion(await sesionDirecta(usuario.id, { revocada: true }))).toBe(401);
  });

  it('si el usuario se desactiva, sus sesiones dejan de servir', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    const token = await sesionDirecta(usuario.id);
    await prisma.usuario.update({ where: { id: usuario.id }, data: { activo: false } });

    expect(await estadoConSesion(token)).toBe(401);
  });

  it('un token desconocido o mal formado no sirve', async () => {
    expect(await estadoConSesion('token-que-no-existe')).toBe(401);
  });

  it('la sesión parcial vence a los 10 minutos si no se avanza', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { con2fa: true });
    const vigente = await sesionDirecta(usuario.id, { completa: false, venceEn: 5 * MINUTO });
    const vencida = await sesionDirecta(usuario.id, { completa: false, venceEn: -MINUTO });

    const api = nuevaApp();
    const conVigente = await publicar(api, '/auth/2fa/verificar', vigente, { codigo: '000000' });
    const conVencida = await publicar(api, '/auth/2fa/verificar', vencida, { codigo: '000000' });

    // La vigente llega hasta comprobar el código (401 por código); la vencida ni siquiera entra.
    expect(cuerpoError(conVigente).codigo).toBe('CODIGO_INVALIDO');
    expect(cuerpoError(conVencida).codigo).toBe('NO_AUTENTICADO');
  });

  it('cada paso correcto renueva el plazo de la sesión parcial', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { debeCambiarContrasena: true });
    const api = nuevaApp();
    const token = tokenDe(await iniciarSesion(api, usuario.login, usuario.contrasena));
    await prisma.sesion.updateMany({
      where: { usuarioId: usuario.id },
      data: { expiraEn: new Date(Date.now() + 30_000) },
    });

    await publicar(api, '/auth/contrasena/cambiar', token, {
      contrasenaActual: usuario.contrasena,
      contrasenaNueva: 'una-contrasena-nueva-1',
    });

    const sesion = await prisma.sesion.findFirstOrThrow({ where: { usuarioId: usuario.id } });
    expect(sesion.expiraEn.getTime() - Date.now()).toBeGreaterThan(9 * MINUTO);
  });

  it('actualiza la última actividad solo si pasó más de un minuto', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    const reciente = await sesionDirecta(usuario.id, { ultimaActividadHace: 5_000 });
    const antigua = await sesionDirecta(usuario.id, { ultimaActividadHace: 10 * MINUTO });
    const servicio = crearServicioAuth({ prisma, config: configPrueba() });

    const antesReciente = await prisma.sesion.findUniqueOrThrow({
      where: { tokenHash: hashToken(reciente) },
    });
    const antesAntigua = await prisma.sesion.findUniqueOrThrow({
      where: { tokenHash: hashToken(antigua) },
    });
    await servicio.resolverSesion(reciente);
    await servicio.resolverSesion(antigua);
    const despuesReciente = await prisma.sesion.findUniqueOrThrow({
      where: { tokenHash: hashToken(reciente) },
    });
    const despuesAntigua = await prisma.sesion.findUniqueOrThrow({
      where: { tokenHash: hashToken(antigua) },
    });

    expect(despuesReciente.ultimaActividad).toEqual(antesReciente.ultimaActividad);
    expect(despuesAntigua.ultimaActividad.getTime()).toBeGreaterThan(
      antesAntigua.ultimaActividad.getTime() + 9 * MINUTO,
    );
  });
});

describe('acciones del administrador sobre otro usuario', () => {
  it('cerrarSesionesDeUsuario revoca todas las sesiones abiertas y lo deja en la bitácora', async () => {
    const admin = await crearUsuarioDePrueba(prisma);
    const objetivo = await crearUsuarioDePrueba(prisma);
    const otro = await crearUsuarioDePrueba(prisma);
    const tokens = [await sesionDirecta(objetivo.id), await sesionDirecta(objetivo.id)];
    const ajena = await sesionDirecta(otro.id);
    const servicio = crearServicioAuth({ prisma, config: configPrueba() });

    const cerradas = await servicio.cerrarSesionesDeUsuario(objetivo.id, admin.id, contexto);

    expect(cerradas).toBe(2);
    for (const token of tokens) expect(await estadoConSesion(token)).toBe(401);
    expect(await estadoConSesion(ajena)).toBe(200);
    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'usuario.cerrar_sesiones', entidadId: objetivo.id },
    });
    expect(registro.usuarioId).toBe(admin.id);
    expect(registro.despues).toEqual({ sesionesCerradas: 2 });
  });

  it('reiniciar2fa borra el secreto, cierra sus sesiones y obliga a configurarlo de nuevo', async () => {
    const admin = await crearUsuarioDePrueba(prisma);
    const objetivo = await crearUsuarioDePrueba(prisma, { con2fa: true });
    const token = await sesionDirecta(objetivo.id);
    const servicio = crearServicioAuth({ prisma, config: configPrueba() });

    await servicio.reiniciar2fa(objetivo.id, admin.id, contexto);

    const enBase = await prisma.usuario.findUniqueOrThrow({ where: { id: objetivo.id } });
    expect(enBase).toMatchObject({ tiene2fa: false, secreto2fa: null, ultimoPaso2fa: null });
    expect(await estadoConSesion(token)).toBe(401);
    const login = await iniciarSesion(nuevaApp(), objetivo.login, objetivo.contrasena);
    expect(login.json<{ siguientePaso: string }>().siguientePaso).toBe('configurar_2fa');
    expect(
      await prisma.auditoria.count({
        where: { accion: 'usuario.reiniciar_2fa', entidadId: objetivo.id, usuarioId: admin.id },
      }),
    ).toBe(1);
  });

  it('tras reiniciar el 2FA, el código del secreto anterior ya no sirve', async () => {
    const admin = await crearUsuarioDePrueba(prisma);
    const objetivo = await crearUsuarioDePrueba(prisma, { con2fa: true });
    const secretoViejo = objetivo.secreto ?? '';
    const servicio = crearServicioAuth({ prisma, config: configPrueba() });
    await servicio.reiniciar2fa(objetivo.id, admin.id, contexto);

    const api = nuevaApp();
    const token = tokenDe(await iniciarSesion(api, objetivo.login, objetivo.contrasena));
    const respuesta = await publicar(api, '/auth/2fa/verificar', token, {
      codigo: await codigoDe(secretoViejo),
    });

    // Aún no tiene 2FA configurado: no puede "verificar" con el secreto viejo.
    expect(respuesta.statusCode).toBe(409);
  });
});
