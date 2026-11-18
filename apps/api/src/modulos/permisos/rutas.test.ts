import { permisosDeRol as deFabrica } from '@cambios-jc/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { cerrarApp, crearAppPrueba } from '../../../test/ayudas.js';
import {
  abrirSesion,
  asegurarEmpresa,
  conSesion,
  crearUsuarioDePrueba,
  cuerpoError,
  llamar,
} from '../../../test/auth.js';
import { cargarPermisos, problemasDePermisos } from '../../lib/permisos.js';
import { crearPrisma, type PrismaClient } from '../../lib/prisma.js';

let prisma: PrismaClient;
let app: FastifyInstance | undefined;

beforeAll(async () => {
  prisma = crearPrisma();
  await asegurarEmpresa(prisma);
});

// Los permisos son de toda la instalación: se vuelven a los de fábrica al terminar.
afterAll(async () => {
  await prisma.permisosRol.deleteMany({});
  await cargarPermisos(prisma);
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

async function sesion(rol: 'administrador' | 'vendedor') {
  const usuario = await crearUsuarioDePrueba(prisma, { rol });
  return { id: usuario.id, token: await abrirSesion(prisma, usuario.id) };
}

const poner = (api: FastifyInstance, token: string, rol: string, permisos: string[]) =>
  api.inject({
    method: 'PUT',
    url: `/permisos/${rol}`,
    headers: conSesion(token),
    payload: { permisos },
  });

describe('problemasDePermisos (restricciones que nadie se salta)', () => {
  it('solo del administrador, incompatibles y no dejar al administrador sin poder corregir', () => {
    expect(problemasDePermisos('vendedor', ['caja.reabrir'])).toHaveLength(1);
    expect(
      problemasDePermisos('vendedor', ['remesa.registrar', 'remesa.tomar_completar']),
    ).toHaveLength(1);
    expect(problemasDePermisos('administrador', ['usuario.gestionar'])).toHaveLength(1);
    expect(problemasDePermisos('vendedor', ['no.existe'])).toHaveLength(1);
    expect(problemasDePermisos('vendedor', [...deFabrica('vendedor')])).toEqual([]);
  });
});

describe('permisos configurables', () => {
  it('el dueño le da un permiso al vendedor y surte efecto de inmediato; restablecer lo quita', async () => {
    const [admin, vendedor] = await Promise.all([sesion('administrador'), sesion('vendedor')]);
    const api = nuevaApp();
    expect(
      (await llamar(api, 'GET', '/reportes/tablero', { token: vendedor.token })).statusCode,
    ).toBe(403);

    const cambio = await poner(api, admin.token, 'vendedor', [
      ...deFabrica('vendedor'),
      'reporte.ver',
    ]);
    expect(cambio.statusCode).toBe(200);
    expect(cambio.json()).toMatchObject({
      roles: expect.arrayContaining([
        expect.objectContaining({ rol: 'vendedor', configurado: true }),
      ]) as unknown,
    });
    expect(
      (await llamar(api, 'GET', '/reportes/tablero', { token: vendedor.token })).statusCode,
    ).toBe(200);
    const yo = await llamar(api, 'GET', '/auth/yo', { token: vendedor.token });
    expect(yo.json<{ permisos: string[] }>().permisos).toContain('reporte.ver');

    const vuelta = await llamar(api, 'POST', '/permisos/vendedor/restablecer', {
      token: admin.token,
    });
    expect(vuelta.statusCode).toBe(200);
    expect(
      (await llamar(api, 'GET', '/reportes/tablero', { token: vendedor.token })).statusCode,
    ).toBe(403);
    expect(
      await prisma.auditoria.count({
        where: { accion: 'permiso.configurar', usuarioId: admin.id },
      }),
    ).toBe(1);
  });

  it('rechaza lo que viola una restricción y solo quien tiene permiso.configurar entra', async () => {
    const [admin, vendedor] = await Promise.all([sesion('administrador'), sesion('vendedor')]);
    const api = nuevaApp();
    const malo = await poner(api, admin.token, 'vendedor', [
      'remesa.registrar',
      'remesa.tomar_completar',
    ]);
    expect(malo.statusCode).toBe(409);
    expect(cuerpoError(malo).mensaje).toMatch(/quien recibe el dinero no es quien lo paga/);
    const sinPoder = await poner(api, admin.token, 'administrador', ['auditoria.ver']);
    expect(sinPoder.statusCode).toBe(409);
    expect((await llamar(api, 'GET', '/permisos', { token: vendedor.token })).statusCode).toBe(403);
    const vista = await llamar(api, 'GET', '/permisos', { token: admin.token });
    expect(vista.json<{ catalogo: string[] }>().catalogo).toContain('permiso.configurar');
  });
});
