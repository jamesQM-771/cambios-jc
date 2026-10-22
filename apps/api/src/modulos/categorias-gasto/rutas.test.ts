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

const nombreUnico = () => `Categoría ${randomUUID().slice(0, 8)}`;

async function sesion(rol: 'administrador' | 'vendedor' | 'digitador') {
  const usuario = await crearUsuarioDePrueba(prisma, { rol });
  return { id: usuario.id, token: await abrirSesion(prisma, usuario.id) };
}

interface CategoriaJson {
  id: string;
  nombre: string;
  activa: boolean;
}

const categoriaDe = (respuesta: { json: () => unknown }): CategoriaJson =>
  (respuesta.json() as { categoria: CategoriaJson }).categoria;

describe('acceso a la API de categorías de gasto', () => {
  it('sin sesión 401; vendedor y digitador 403 en todas las rutas', async () => {
    const api = nuevaApp();
    const admin = await sesion('administrador');
    const categoria = categoriaDe(
      await llamar(api, 'POST', '/categorias-gasto', {
        token: admin.token,
        cuerpo: { nombre: nombreUnico() },
      }),
    );
    const rutas = [
      ['GET', '/categorias-gasto', undefined],
      ['POST', '/categorias-gasto', { nombre: nombreUnico() }],
      ['PATCH', `/categorias-gasto/${categoria.id}`, { nombre: nombreUnico() }],
      ['POST', `/categorias-gasto/${categoria.id}/desactivar`, undefined],
      ['POST', `/categorias-gasto/${categoria.id}/reactivar`, undefined],
    ] as const;

    expect((await llamar(api, 'GET', '/categorias-gasto')).statusCode).toBe(401);
    for (const rol of ['vendedor', 'digitador'] as const) {
      const otro = await sesion(rol);
      for (const [metodo, url, cuerpo] of rutas) {
        const respuesta = await llamar(api, metodo, url, { token: otro.token, cuerpo });
        expect(respuesta.statusCode, `${rol} ${metodo} ${url}`).toBe(403);
        expect(cuerpoError(respuesta).codigo).toBe('SIN_PERMISO');
      }
    }
  });
});

describe('categorías de gasto', () => {
  it('crea una categoría activa y queda en la bitácora', async () => {
    const admin = await sesion('administrador');
    const nombre = nombreUnico();

    const respuesta = await llamar(nuevaApp(), 'POST', '/categorias-gasto', {
      token: admin.token,
      cuerpo: { nombre },
    });

    expect(respuesta.statusCode).toBe(201);
    expect(categoriaDe(respuesta)).toMatchObject({ nombre, activa: true });
    const registro = await prisma.auditoria.findFirst({
      where: { accion: 'categoria_gasto.crear', entidadId: categoriaDe(respuesta).id },
    });
    expect(registro?.usuarioId).toBe(admin.id);
  });

  it('rechaza un nombre repetido o demasiado corto', async () => {
    const admin = await sesion('administrador');
    const api = nuevaApp();
    const nombre = nombreUnico();
    await llamar(api, 'POST', '/categorias-gasto', { token: admin.token, cuerpo: { nombre } });

    const repetido = await llamar(api, 'POST', '/categorias-gasto', {
      token: admin.token,
      cuerpo: { nombre },
    });
    const corto = await llamar(api, 'POST', '/categorias-gasto', {
      token: admin.token,
      cuerpo: { nombre: 'x' },
    });

    expect(repetido.statusCode).toBe(409);
    expect(corto.statusCode).toBe(400);
  });

  it('edita el nombre con antes y después en la bitácora, y una inexistente responde 404', async () => {
    const admin = await sesion('administrador');
    const api = nuevaApp();
    const creada = categoriaDe(
      await llamar(api, 'POST', '/categorias-gasto', {
        token: admin.token,
        cuerpo: { nombre: nombreUnico() },
      }),
    );
    const nuevo = nombreUnico();

    const editada = await llamar(api, 'PATCH', `/categorias-gasto/${creada.id}`, {
      token: admin.token,
      cuerpo: { nombre: nuevo },
    });
    const inexistente = await llamar(api, 'PATCH', `/categorias-gasto/${randomUUID()}`, {
      token: admin.token,
      cuerpo: { nombre: nombreUnico() },
    });

    expect(categoriaDe(editada).nombre).toBe(nuevo);
    expect(inexistente.statusCode).toBe(404);
    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'categoria_gasto.editar', entidadId: creada.id },
    });
    expect(JSON.stringify(registro.antes)).toContain(creada.nombre);
    expect(JSON.stringify(registro.despues)).toContain(nuevo);
  });

  it('desactiva y reactiva (repetirlo no falla) y filtra por activa', async () => {
    const admin = await sesion('administrador');
    const api = nuevaApp();
    const creada = categoriaDe(
      await llamar(api, 'POST', '/categorias-gasto', {
        token: admin.token,
        cuerpo: { nombre: nombreUnico() },
      }),
    );
    const accion = (nombre: 'desactivar' | 'reactivar') =>
      llamar(api, 'POST', `/categorias-gasto/${creada.id}/${nombre}`, { token: admin.token });
    const ids = async (activa: string) =>
      (
        await llamar(api, 'GET', '/categorias-gasto', {
          token: admin.token,
          consulta: `activa=${activa}`,
        })
      )
        .json<{ categorias: CategoriaJson[] }>()
        .categorias.map((c) => c.id);

    expect(categoriaDe(await accion('desactivar')).activa).toBe(false);
    expect((await accion('desactivar')).statusCode).toBe(200);
    expect(await ids('false')).toContain(creada.id);
    expect(await ids('true')).not.toContain(creada.id);
    expect(categoriaDe(await accion('reactivar')).activa).toBe(true);
    expect(await ids('true')).toContain(creada.id);
  });
});
