import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { cerrarApp, crearAppPrueba } from '../../../test/ayudas.js';
import {
  abrirSesion,
  asegurarEmpresa,
  crearUsuarioDePrueba,
  cuerpoError,
  llamar,
} from '../../../test/auth.js';
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

function nuevaApp(): FastifyInstance {
  app = crearAppPrueba({ sesionReal: true, prisma: crearPrisma() });
  return app;
}

const nombreUnico = (prefijo = 'Sucursal') => `${prefijo} ${randomUUID().slice(0, 8)}`;

async function administradorConSesion(): Promise<{ token: string }> {
  const admin = await crearUsuarioDePrueba(prisma, { rol: 'administrador' });
  return { token: await abrirSesion(prisma, admin.id) };
}

interface SucursalJson {
  id: string;
  nombre: string;
  ciudad: string;
  activa: boolean;
}

describe('acceso a la API de sucursales', () => {
  const idCualquiera = randomUUID();
  const rutas: ['GET' | 'POST' | 'PATCH', string][] = [
    ['GET', '/sucursales'],
    ['POST', '/sucursales'],
    ['PATCH', `/sucursales/${idCualquiera}`],
    ['POST', `/sucursales/${idCualquiera}/desactivar`],
    ['POST', `/sucursales/${idCualquiera}/reactivar`],
  ];

  it.each(rutas)('%s %s: sin sesión responde 401', async (metodo, url) => {
    const respuesta = await llamar(nuevaApp(), metodo, url);
    expect(respuesta.statusCode).toBe(401);
  });

  it.each(['vendedor', 'digitador'] as const)(
    'un %s recibe 403 en todas las rutas',
    async (rol) => {
      const usuario = await crearUsuarioDePrueba(prisma, { rol });
      const token = await abrirSesion(prisma, usuario.id);
      const api = nuevaApp();

      for (const [metodo, url] of rutas) {
        const respuesta = await llamar(api, metodo, url, { token });
        expect(respuesta.statusCode, `${metodo} ${url}`).toBe(403);
        expect(cuerpoError(respuesta).codigo).toBe('SIN_PERMISO');
      }
    },
  );
});

describe('crear sucursal', () => {
  it('crea la sucursal activa por defecto', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const nombre = nombreUnico();

    const respuesta = await llamar(api, 'POST', '/sucursales', {
      token,
      cuerpo: { nombre, ciudad: 'Cúcuta' },
    });

    expect(respuesta.statusCode).toBe(201);
    const { sucursal } = respuesta.json<{ sucursal: SucursalJson }>();
    expect(sucursal).toMatchObject({ nombre, ciudad: 'Cúcuta', activa: true });
  });

  it('rechaza un nombre repetido', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const nombre = nombreUnico();
    await llamar(api, 'POST', '/sucursales', { token, cuerpo: { nombre, ciudad: 'Cúcuta' } });

    const respuesta = await llamar(api, 'POST', '/sucursales', {
      token,
      cuerpo: { nombre, ciudad: 'Cúcuta' },
    });

    expect(respuesta.statusCode).toBe(409);
    expect(cuerpoError(respuesta).codigo).toBe('VALOR_EN_USO');
  });

  it('queda registrada en la bitácora', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const nombre = nombreUnico();

    const respuesta = await llamar(api, 'POST', '/sucursales', {
      token,
      cuerpo: { nombre, ciudad: 'Cúcuta' },
    });
    const { sucursal } = respuesta.json<{ sucursal: SucursalJson }>();

    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'sucursal.crear', entidadId: sucursal.id },
    });
    expect(registro.despues).toMatchObject({ nombre, ciudad: 'Cúcuta' });
  });
});

describe('listar sucursales', () => {
  it('sin filtro trae activas e inactivas; con filtro, solo las pedidas', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const activa = await llamar(api, 'POST', '/sucursales', {
      token,
      cuerpo: { nombre: nombreUnico(), ciudad: 'Cúcuta' },
    });
    const creada = await llamar(api, 'POST', '/sucursales', {
      token,
      cuerpo: { nombre: nombreUnico(), ciudad: 'Cúcuta' },
    });
    const { sucursal: activaJson } = activa.json<{ sucursal: SucursalJson }>();
    const { sucursal: inactivaJson } = creada.json<{ sucursal: SucursalJson }>();
    await llamar(api, 'POST', `/sucursales/${inactivaJson.id}/desactivar`, { token });

    const todas = await llamar(api, 'GET', '/sucursales', { token });
    const idsTodas = todas.json<{ sucursales: SucursalJson[] }>().sucursales.map((s) => s.id);
    expect(idsTodas).toEqual(expect.arrayContaining([activaJson.id, inactivaJson.id]));

    const soloActivas = await llamar(api, 'GET', '/sucursales?activa=true', { token });
    const idsActivas = soloActivas
      .json<{ sucursales: SucursalJson[] }>()
      .sucursales.map((s) => s.id);
    expect(idsActivas).toContain(activaJson.id);
    expect(idsActivas).not.toContain(inactivaJson.id);

    const soloInactivas = await llamar(api, 'GET', '/sucursales?activa=false', { token });
    expect(
      soloInactivas.json<{ sucursales: SucursalJson[] }>().sucursales.map((s) => s.id),
    ).toContain(inactivaJson.id);
  });
});

describe('editar sucursal', () => {
  it('cambia el nombre y registra antes/después en la bitácora', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const creada = await llamar(api, 'POST', '/sucursales', {
      token,
      cuerpo: { nombre: nombreUnico('Vieja'), ciudad: 'Cúcuta' },
    });
    const { sucursal } = creada.json<{ sucursal: SucursalJson }>();
    const nombreNuevo = nombreUnico('Nueva');

    const respuesta = await llamar(api, 'PATCH', `/sucursales/${sucursal.id}`, {
      token,
      cuerpo: { nombre: nombreNuevo },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json<{ sucursal: SucursalJson }>().sucursal.nombre).toBe(nombreNuevo);
    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'sucursal.editar', entidadId: sucursal.id },
    });
    expect(registro.despues).toMatchObject({ nombre: nombreNuevo });
  });

  it('sin ningún dato para cambiar, responde 400', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const creada = await llamar(api, 'POST', '/sucursales', {
      token,
      cuerpo: { nombre: nombreUnico(), ciudad: 'Cúcuta' },
    });
    const { sucursal } = creada.json<{ sucursal: SucursalJson }>();

    const respuesta = await llamar(api, 'PATCH', `/sucursales/${sucursal.id}`, {
      token,
      cuerpo: {},
    });

    expect(respuesta.statusCode).toBe(400);
  });

  it('una sucursal que no existe responde 404', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();

    const respuesta = await llamar(api, 'PATCH', `/sucursales/${randomUUID()}`, {
      token,
      cuerpo: { nombre: 'No existe' },
    });

    expect(respuesta.statusCode).toBe(404);
  });
});

describe('desactivar y reactivar sucursal', () => {
  it('desactiva una sucursal sin usuarios activos, y desactivarla dos veces no falla', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const creada = await llamar(api, 'POST', '/sucursales', {
      token,
      cuerpo: { nombre: nombreUnico(), ciudad: 'Cúcuta' },
    });
    const { sucursal } = creada.json<{ sucursal: SucursalJson }>();

    const primera = await llamar(api, 'POST', `/sucursales/${sucursal.id}/desactivar`, { token });
    const segunda = await llamar(api, 'POST', `/sucursales/${sucursal.id}/desactivar`, { token });

    expect(primera.json<{ sucursal: SucursalJson }>().sucursal.activa).toBe(false);
    expect(segunda.statusCode).toBe(200);
    const registros = await prisma.auditoria.findMany({
      where: { accion: 'sucursal.desactivar', entidadId: sucursal.id },
    });
    expect(registros).toHaveLength(1);
  });

  it('no se puede desactivar con un usuario activo asignado', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const creada = await llamar(api, 'POST', '/sucursales', {
      token,
      cuerpo: { nombre: nombreUnico(), ciudad: 'Cúcuta' },
    });
    const { sucursal } = creada.json<{ sucursal: SucursalJson }>();
    await crearUsuarioDePrueba(prisma, { rol: 'vendedor', sucursalId: sucursal.id });

    const respuesta = await llamar(api, 'POST', `/sucursales/${sucursal.id}/desactivar`, {
      token,
    });

    expect(respuesta.statusCode).toBe(409);
    expect(cuerpoError(respuesta).codigo).toBe('ESTADO_INVALIDO');
    const despues = await prisma.sucursal.findUniqueOrThrow({ where: { id: sucursal.id } });
    expect(despues.activa).toBe(true);
  });

  it('sí se puede desactivar si el usuario asignado ya está inactivo', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const creada = await llamar(api, 'POST', '/sucursales', {
      token,
      cuerpo: { nombre: nombreUnico(), ciudad: 'Cúcuta' },
    });
    const { sucursal } = creada.json<{ sucursal: SucursalJson }>();
    const usuario = await crearUsuarioDePrueba(prisma, {
      rol: 'vendedor',
      sucursalId: sucursal.id,
    });
    await prisma.usuario.update({ where: { id: usuario.id }, data: { activo: false } });

    const respuesta = await llamar(api, 'POST', `/sucursales/${sucursal.id}/desactivar`, {
      token,
    });

    expect(respuesta.statusCode).toBe(200);
  });

  it('reactiva una sucursal desactivada', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const creada = await llamar(api, 'POST', '/sucursales', {
      token,
      cuerpo: { nombre: nombreUnico(), ciudad: 'Cúcuta' },
    });
    const { sucursal } = creada.json<{ sucursal: SucursalJson }>();
    await llamar(api, 'POST', `/sucursales/${sucursal.id}/desactivar`, { token });

    const respuesta = await llamar(api, 'POST', `/sucursales/${sucursal.id}/reactivar`, {
      token,
    });

    expect(respuesta.json<{ sucursal: SucursalJson }>().sucursal.activa).toBe(true);
  });
});
