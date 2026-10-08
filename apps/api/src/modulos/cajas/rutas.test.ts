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

const nombreUnico = (prefijo = 'Caja') => `${prefijo} ${randomUUID().slice(0, 8)}`;

async function administradorConSesion(): Promise<{ token: string }> {
  const admin = await crearUsuarioDePrueba(prisma, { rol: 'administrador' });
  return { token: await abrirSesion(prisma, admin.id) };
}

async function sucursalDePrueba(activa = true) {
  return prisma.sucursal.create({
    data: { nombre: nombreUnico('Sucursal'), ciudad: 'Cúcuta', activa },
  });
}

interface CajaJson {
  id: string;
  nombre: string;
  sucursalId: string;
  sucursalNombre: string;
  activa: boolean;
}

describe('acceso a la API de cajas', () => {
  const idCualquiera = randomUUID();
  const rutas: ['GET' | 'POST' | 'PATCH', string][] = [
    ['GET', '/cajas'],
    ['POST', '/cajas'],
    ['PATCH', `/cajas/${idCualquiera}`],
    ['POST', `/cajas/${idCualquiera}/desactivar`],
    ['POST', `/cajas/${idCualquiera}/reactivar`],
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

describe('crear caja', () => {
  it('crea la caja activa en una sucursal activa', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();
    const nombre = nombreUnico();

    const respuesta = await llamar(api, 'POST', '/cajas', {
      token,
      cuerpo: { nombre, sucursalId: sucursal.id },
    });

    expect(respuesta.statusCode).toBe(201);
    const { caja } = respuesta.json<{ caja: CajaJson }>();
    expect(caja).toMatchObject({
      nombre,
      sucursalId: sucursal.id,
      sucursalNombre: sucursal.nombre,
      activa: true,
    });
  });

  it('no se puede crear en una sucursal inactiva', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba(false);

    const respuesta = await llamar(api, 'POST', '/cajas', {
      token,
      cuerpo: { nombre: nombreUnico(), sucursalId: sucursal.id },
    });

    expect(respuesta.statusCode).toBe(400);
    expect(cuerpoError(respuesta).codigo).toBe('VALIDACION_FALLIDA');
  });

  it('no se puede crear en una sucursal que no existe', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();

    const respuesta = await llamar(api, 'POST', '/cajas', {
      token,
      cuerpo: { nombre: nombreUnico(), sucursalId: randomUUID() },
    });

    expect(respuesta.statusCode).toBe(400);
  });

  it('rechaza un nombre repetido dentro de la misma sucursal, pero lo permite en otra', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursalA = await sucursalDePrueba();
    const sucursalB = await sucursalDePrueba();
    const nombre = nombreUnico();
    await llamar(api, 'POST', '/cajas', { token, cuerpo: { nombre, sucursalId: sucursalA.id } });

    const repetida = await llamar(api, 'POST', '/cajas', {
      token,
      cuerpo: { nombre, sucursalId: sucursalA.id },
    });
    const otraSucursal = await llamar(api, 'POST', '/cajas', {
      token,
      cuerpo: { nombre, sucursalId: sucursalB.id },
    });

    expect(repetida.statusCode).toBe(409);
    expect(cuerpoError(repetida).codigo).toBe('VALOR_EN_USO');
    expect(otraSucursal.statusCode).toBe(201);
  });

  it('queda registrada en la bitácora', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();
    const nombre = nombreUnico();

    const respuesta = await llamar(api, 'POST', '/cajas', {
      token,
      cuerpo: { nombre, sucursalId: sucursal.id },
    });
    const { caja } = respuesta.json<{ caja: CajaJson }>();

    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'caja.crear', entidadId: caja.id },
    });
    expect(registro.despues).toMatchObject({ nombre, sucursalId: sucursal.id });
  });
});

describe('listar cajas', () => {
  it('filtra por sucursal y por activa', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursalA = await sucursalDePrueba();
    const sucursalB = await sucursalDePrueba();
    const creadaA = await llamar(api, 'POST', '/cajas', {
      token,
      cuerpo: { nombre: nombreUnico(), sucursalId: sucursalA.id },
    });
    const creadaB = await llamar(api, 'POST', '/cajas', {
      token,
      cuerpo: { nombre: nombreUnico(), sucursalId: sucursalB.id },
    });
    const { caja: cajaA } = creadaA.json<{ caja: CajaJson }>();
    const { caja: cajaB } = creadaB.json<{ caja: CajaJson }>();
    await llamar(api, 'POST', `/cajas/${cajaB.id}/desactivar`, { token });

    const porSucursal = await llamar(api, 'GET', `/cajas?sucursalId=${sucursalA.id}`, { token });
    const idsPorSucursal = porSucursal.json<{ cajas: CajaJson[] }>().cajas.map((c) => c.id);
    expect(idsPorSucursal).toContain(cajaA.id);
    expect(idsPorSucursal).not.toContain(cajaB.id);

    const soloActivas = await llamar(api, 'GET', '/cajas?activa=true', { token });
    expect(soloActivas.json<{ cajas: CajaJson[] }>().cajas.map((c) => c.id)).not.toContain(
      cajaB.id,
    );

    const soloInactivas = await llamar(api, 'GET', '/cajas?activa=false', { token });
    expect(soloInactivas.json<{ cajas: CajaJson[] }>().cajas.map((c) => c.id)).toContain(cajaB.id);
  });
});

describe('editar caja', () => {
  it('cambia el nombre y registra antes/después en la bitácora', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();
    const creada = await llamar(api, 'POST', '/cajas', {
      token,
      cuerpo: { nombre: nombreUnico('Vieja'), sucursalId: sucursal.id },
    });
    const { caja } = creada.json<{ caja: CajaJson }>();
    const nombreNuevo = nombreUnico('Nueva');

    const respuesta = await llamar(api, 'PATCH', `/cajas/${caja.id}`, {
      token,
      cuerpo: { nombre: nombreNuevo },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json<{ caja: CajaJson }>().caja.nombre).toBe(nombreNuevo);
    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'caja.editar', entidadId: caja.id },
    });
    expect(registro.despues).toMatchObject({ nombre: nombreNuevo });
  });

  it('una caja que no existe responde 404', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();

    const respuesta = await llamar(api, 'PATCH', `/cajas/${randomUUID()}`, {
      token,
      cuerpo: { nombre: 'No existe' },
    });

    expect(respuesta.statusCode).toBe(404);
  });
});

describe('desactivar y reactivar caja', () => {
  it('desactiva, y desactivarla dos veces no falla', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();
    const creada = await llamar(api, 'POST', '/cajas', {
      token,
      cuerpo: { nombre: nombreUnico(), sucursalId: sucursal.id },
    });
    const { caja } = creada.json<{ caja: CajaJson }>();

    const primera = await llamar(api, 'POST', `/cajas/${caja.id}/desactivar`, { token });
    const segunda = await llamar(api, 'POST', `/cajas/${caja.id}/desactivar`, { token });

    expect(primera.json<{ caja: CajaJson }>().caja.activa).toBe(false);
    expect(segunda.statusCode).toBe(200);
    const registros = await prisma.auditoria.findMany({
      where: { accion: 'caja.desactivar', entidadId: caja.id },
    });
    expect(registros).toHaveLength(1);
  });

  it('reactiva una caja desactivada', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();
    const creada = await llamar(api, 'POST', '/cajas', {
      token,
      cuerpo: { nombre: nombreUnico(), sucursalId: sucursal.id },
    });
    const { caja } = creada.json<{ caja: CajaJson }>();
    await llamar(api, 'POST', `/cajas/${caja.id}/desactivar`, { token });

    const respuesta = await llamar(api, 'POST', `/cajas/${caja.id}/reactivar`, { token });

    expect(respuesta.json<{ caja: CajaJson }>().caja.activa).toBe(true);
  });
});
