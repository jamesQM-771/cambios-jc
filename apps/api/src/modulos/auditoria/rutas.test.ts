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
  type UsuarioDePrueba,
} from '../../../test/auth.js';
import { crearPrisma, type PrismaClient } from '../../lib/prisma.js';

let prisma: PrismaClient;
let app: FastifyInstance | undefined;
let token: string;
let admin: UsuarioDePrueba;

beforeAll(async () => {
  prisma = crearPrisma();
  await asegurarEmpresa(prisma);
  admin = await crearUsuarioDePrueba(prisma, { rol: 'administrador' });
  token = await abrirSesion(prisma, admin.id);
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

interface RegistroJson {
  id: string;
  fecha: string;
  usuario: { id: string; login: string; nombre: string } | null;
  accion: string;
  entidad: string;
  entidadId: string | null;
  antes: unknown;
  despues: unknown;
  ip: string | null;
  agenteUsuario: string | null;
}

interface ListaJson {
  registros: RegistroJson[];
  total: number;
  pagina: number;
  porPagina: number;
}

/**
 * Tres registros con una acción única, en tres momentos conocidos:
 * - r1: 9-mar 23:30 en Bogotá (10-mar 04:30 UTC)
 * - r2: 10-mar 00:30 en Bogotá (10-mar 05:30 UTC)
 * - r3: 12-mar 10:00 en Bogotá
 */
async function crearRegistros() {
  const accion = `prueba.auditoria.${randomUUID()}`;
  const entidadId = randomUUID();
  const r1 = await prisma.auditoria.create({
    data: {
      accion,
      entidad: 'entidad_a',
      entidadId,
      usuarioId: admin.id,
      fecha: new Date('2026-03-10T04:30:00Z'),
      antes: { valor: 1 },
      despues: { valor: 2 },
      ip: '10.0.0.7',
      agenteUsuario: 'Navegador de prueba',
    },
  });
  const r2 = await prisma.auditoria.create({
    data: { accion, entidad: 'entidad_b', fecha: new Date('2026-03-10T05:30:00Z') },
  });
  const r3 = await prisma.auditoria.create({
    data: { accion, entidad: 'entidad_a', fecha: new Date('2026-03-12T15:00:00Z') },
  });
  return { accion, entidadId, r1: r1.id.toString(), r2: r2.id.toString(), r3: r3.id.toString() };
}

const consultar = (consulta: string) =>
  llamar(nuevaApp(), 'GET', '/auditoria', { token, consulta });
const ids = (respuesta: { json: () => unknown }) =>
  (respuesta.json() as ListaJson).registros.map((registro) => registro.id);

describe('acceso a la bitácora', () => {
  it('sin sesión responde 401', async () => {
    expect((await llamar(nuevaApp(), 'GET', '/auditoria')).statusCode).toBe(401);
  });

  it.each(['vendedor', 'digitador'] as const)('un %s recibe 403', async (rol) => {
    const usuario = await crearUsuarioDePrueba(prisma, { rol });
    const tokenUsuario = await abrirSesion(prisma, usuario.id);

    const respuesta = await llamar(nuevaApp(), 'GET', '/auditoria', { token: tokenUsuario });

    expect(respuesta.statusCode).toBe(403);
    expect(cuerpoError(respuesta).codigo).toBe('SIN_PERMISO');
  });
});

describe('GET /auditoria', () => {
  it('devuelve los registros del más reciente al más antiguo, con todos sus datos', async () => {
    const { accion, entidadId, r1, r2, r3 } = await crearRegistros();

    const respuesta = await consultar(`accion=${accion}`);

    expect(respuesta.statusCode).toBe(200);
    const lista = respuesta.json<ListaJson>();
    expect(lista).toMatchObject({ total: 3, pagina: 1, porPagina: 50 });
    expect(lista.registros.map((registro) => registro.id)).toEqual([r3, r2, r1]);
    // El id viaja como texto, no como número.
    for (const registro of lista.registros) expect(typeof registro.id).toBe('string');

    const completo = lista.registros[2];
    expect(completo).toMatchObject({
      accion,
      entidad: 'entidad_a',
      entidadId,
      antes: { valor: 1 },
      despues: { valor: 2 },
      ip: '10.0.0.7',
      agenteUsuario: 'Navegador de prueba',
      fecha: '2026-03-10T04:30:00.000Z',
      usuario: { id: admin.id, login: admin.login, nombre: 'Usuario de prueba' },
    });
    // Un registro sin usuario ni datos queda con valores nulos.
    expect(lista.registros[1]).toMatchObject({ usuario: null, entidadId: null, ip: null });
  });

  it('nunca devuelve datos de autenticación del usuario', async () => {
    const { accion } = await crearRegistros();

    const respuesta = await consultar(`accion=${accion}`);

    expect(respuesta.body).not.toMatch(/hashContrasena|secreto2fa|intentosFallidos/);
  });

  it('filtra por entidad, entidadId y usuario', async () => {
    const { accion, entidadId, r1, r3 } = await crearRegistros();

    expect(ids(await consultar(`accion=${accion}&entidad=entidad_a`))).toEqual([r3, r1]);
    expect(ids(await consultar(`accion=${accion}&entidadId=${entidadId}`))).toEqual([r1]);
    expect(ids(await consultar(`accion=${accion}&usuarioId=${admin.id}`))).toEqual([r1]);
    expect(ids(await consultar(`accion=${accion}&entidad=no_existe`))).toEqual([]);
  });

  it('los días se miden en la zona horaria de la empresa (Bogotá), no en UTC', async () => {
    const { accion, r1, r2, r3 } = await crearRegistros();

    // r1 ocurrió el 9 de marzo a las 11:30 p. m. en Bogotá aunque en UTC ya fuera 10 de marzo.
    expect(ids(await consultar(`accion=${accion}&desde=2026-03-10&hasta=2026-03-10`))).toEqual([
      r2,
    ]);
    expect(ids(await consultar(`accion=${accion}&hasta=2026-03-09`))).toEqual([r1]);
    expect(ids(await consultar(`accion=${accion}&desde=2026-03-09&hasta=2026-03-10`))).toEqual([
      r2,
      r1,
    ]);
    expect(ids(await consultar(`accion=${accion}&desde=2026-03-11`))).toEqual([r3]);
    expect(ids(await consultar(`accion=${accion}&desde=2026-03-13`))).toEqual([]);
  });

  it('usa la zona horaria configurada en la empresa', async () => {
    const { accion, r1, r2 } = await crearRegistros();
    const zonaOriginal = (await prisma.empresa.findUniqueOrThrow({ where: { unica: true } }))
      .zonaHoraria;
    await prisma.empresa.update({ where: { unica: true }, data: { zonaHoraria: 'UTC' } });
    try {
      // En UTC, r1 y r2 caen ambos el 10 de marzo.
      expect(ids(await consultar(`accion=${accion}&desde=2026-03-10&hasta=2026-03-10`))).toEqual([
        r2,
        r1,
      ]);
    } finally {
      await prisma.empresa.update({ where: { unica: true }, data: { zonaHoraria: zonaOriginal } });
    }
  });

  it('pagina los resultados', async () => {
    const { accion, r1, r2, r3 } = await crearRegistros();

    const primera = (await consultar(`accion=${accion}&porPagina=2&pagina=1`)).json<ListaJson>();
    const segunda = (await consultar(`accion=${accion}&porPagina=2&pagina=2`)).json<ListaJson>();
    const tercera = (await consultar(`accion=${accion}&porPagina=2&pagina=3`)).json<ListaJson>();

    expect(primera.registros.map((r) => r.id)).toEqual([r3, r2]);
    expect(segunda.registros.map((r) => r.id)).toEqual([r1]);
    expect(tercera.registros).toEqual([]);
    expect([primera.total, segunda.total, tercera.total]).toEqual([3, 3, 3]);
    expect(segunda).toMatchObject({ pagina: 2, porPagina: 2 });
  });

  it('consultar la bitácora no agrega registros', async () => {
    const { accion } = await crearRegistros();
    const antes = await prisma.auditoria.count();

    await consultar(`accion=${accion}`);

    expect(await prisma.auditoria.count()).toBe(antes);
  });

  it.each([
    ['desde posterior a hasta', 'desde=2026-03-12&hasta=2026-03-10'],
    ['fecha que no existe', 'desde=2026-02-30'],
    ['fecha en otro formato', 'desde=10/03/2026'],
    ['hasta mal escrito', 'hasta=ayer'],
    ['usuario con id inválido', 'usuarioId=no-es-un-id'],
    ['página en cero', 'pagina=0'],
    ['demasiados por página', 'porPagina=101'],
    ['acción vacía', 'accion='],
  ])('rechaza %s', async (_caso, consulta) => {
    const respuesta = await consultar(consulta);

    expect(respuesta.statusCode).toBe(400);
    expect(cuerpoError(respuesta).codigo).toBe('VALIDACION_FALLIDA');
  });
});
