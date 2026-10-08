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
import { BANCOS_VENEZUELA } from '../../lib/bancos-venezuela.js';
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

// La hora del proceso varía entre corridas; el contador garantiza que no se repita dentro de la
// misma corrida. Puede repetirse entre corridas contra la misma base sin reiniciar (CONSERVAR_BASE_
// PRUEBAS=1) si caen justo en el mismo milisegundo módulo 10000, por eso ninguna prueba de este
// archivo asume que la base está vacía.
const semillaProceso = Date.now() % 10_000;
const CODIGOS_REALES = new Set(BANCOS_VENEZUELA.map((b) => b.codigo));
let contadorCodigo = 0;
const codigoUnico = (): string => {
  let candidato: string;
  do {
    contadorCodigo += 1;
    candidato = String((semillaProceso + contadorCodigo) % 10_000).padStart(4, '0');
  } while (CODIGOS_REALES.has(candidato));
  return candidato;
};

async function administradorConSesion(): Promise<{ token: string }> {
  const admin = await crearUsuarioDePrueba(prisma, { rol: 'administrador' });
  return { token: await abrirSesion(prisma, admin.id) };
}

interface BancoJson {
  id: string;
  codigo: string;
  nombre: string;
  pais: string;
  activo: boolean;
}

describe('acceso a la API de bancos', () => {
  const idCualquiera = randomUUID();
  const rutas: ['GET' | 'POST' | 'PATCH', string][] = [
    ['GET', '/bancos'],
    ['POST', '/bancos'],
    ['PATCH', `/bancos/${idCualquiera}`],
    ['POST', `/bancos/${idCualquiera}/desactivar`],
    ['POST', `/bancos/${idCualquiera}/reactivar`],
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

describe('crear banco', () => {
  it('crea el banco con el país por defecto VE', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const codigo = codigoUnico();

    const respuesta = await llamar(api, 'POST', '/bancos', {
      token,
      cuerpo: { codigo, nombre: '  Banco de Prueba ' },
    });

    expect(respuesta.statusCode).toBe(201);
    const { banco } = respuesta.json<{ banco: BancoJson }>();
    expect(banco).toMatchObject({ codigo, nombre: 'Banco de Prueba', pais: 'VE', activo: true });
  });

  it('rechaza un código repetido', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const codigo = codigoUnico();
    await llamar(api, 'POST', '/bancos', { token, cuerpo: { codigo, nombre: 'Primero' } });

    const respuesta = await llamar(api, 'POST', '/bancos', {
      token,
      cuerpo: { codigo, nombre: 'Segundo' },
    });

    expect(respuesta.statusCode).toBe(409);
    expect(cuerpoError(respuesta).codigo).toBe('CODIGO_EN_USO');
  });

  it('rechaza un código que no son 4 dígitos', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();

    const respuesta = await llamar(api, 'POST', '/bancos', {
      token,
      cuerpo: { codigo: 'ABCD', nombre: 'Banco raro' },
    });

    expect(respuesta.statusCode).toBe(400);
    expect(cuerpoError(respuesta).codigo).toBe('VALIDACION_FALLIDA');
  });

  it('queda registrado en la bitácora', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const codigo = codigoUnico();

    const respuesta = await llamar(api, 'POST', '/bancos', {
      token,
      cuerpo: { codigo, nombre: 'Banco Auditado' },
    });
    const { banco } = respuesta.json<{ banco: BancoJson }>();

    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'banco.crear', entidadId: banco.id },
    });
    // "codigo" se oculta siempre en la bitácora (pensado para el código del 2FA, CLAUDE.md §7);
    // el del banco viaja con su propia clave para no perderse como "[OCULTO]".
    expect(registro.despues).toMatchObject({ codigoBanco: codigo, nombre: 'Banco Auditado' });
  });
});

describe('listar bancos', () => {
  it('filtra por activo y por texto (nombre o código)', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const codigoA = codigoUnico();
    const codigoB = codigoUnico();
    // Un marcador único por corrida: evita confundirse con filas de otra corrida en la misma base
    // (las pruebas no asumen que la base está vacía, ver codigoUnico()).
    const marcador = `Buscable-${randomUUID().slice(0, 8)}`;
    await llamar(api, 'POST', '/bancos', {
      token,
      cuerpo: { codigo: codigoA, nombre: `Banco Alfa ${marcador}` },
    });
    const creadoB = await llamar(api, 'POST', '/bancos', {
      token,
      cuerpo: { codigo: codigoB, nombre: 'Banco Beta' },
    });
    const { banco: bancoB } = creadoB.json<{ banco: BancoJson }>();
    await llamar(api, 'POST', `/bancos/${bancoB.id}/desactivar`, { token });

    const porNombre = await llamar(api, 'GET', `/bancos?busqueda=${marcador}`, { token });
    expect(porNombre.json<{ bancos: BancoJson[] }>().bancos.map((b) => b.codigo)).toEqual([
      codigoA,
    ]);

    const porCodigo = await llamar(api, 'GET', `/bancos?busqueda=${codigoB}`, { token });
    expect(porCodigo.json<{ bancos: BancoJson[] }>().bancos.map((b) => b.codigo)).toContain(
      codigoB,
    );

    const soloActivos = await llamar(api, 'GET', '/bancos?activo=true', { token });
    expect(
      soloActivos.json<{ bancos: BancoJson[] }>().bancos.some((b) => b.codigo === codigoB),
    ).toBe(false);

    const soloInactivos = await llamar(api, 'GET', '/bancos?activo=false', { token });
    expect(
      soloInactivos.json<{ bancos: BancoJson[] }>().bancos.some((b) => b.codigo === codigoB),
    ).toBe(true);
  });
});

describe('editar banco', () => {
  it('cambia el nombre y registra antes/después en la bitácora', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const codigo = codigoUnico();
    const creado = await llamar(api, 'POST', '/bancos', {
      token,
      cuerpo: { codigo, nombre: 'Nombre Viejo' },
    });
    const { banco } = creado.json<{ banco: BancoJson }>();

    const respuesta = await llamar(api, 'PATCH', `/bancos/${banco.id}`, {
      token,
      cuerpo: { nombre: 'Nombre Nuevo' },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json<{ banco: BancoJson }>().banco.nombre).toBe('Nombre Nuevo');
    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'banco.editar', entidadId: banco.id },
    });
    expect(registro.antes).toMatchObject({ nombre: 'Nombre Viejo' });
    expect(registro.despues).toMatchObject({ nombre: 'Nombre Nuevo' });
  });

  it('sin ningún dato para cambiar, responde 400', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const creado = await llamar(api, 'POST', '/bancos', {
      token,
      cuerpo: { codigo: codigoUnico(), nombre: 'Banco X' },
    });
    const { banco } = creado.json<{ banco: BancoJson }>();

    const respuesta = await llamar(api, 'PATCH', `/bancos/${banco.id}`, { token, cuerpo: {} });

    expect(respuesta.statusCode).toBe(400);
  });

  it('un banco que no existe responde 404', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();

    const respuesta = await llamar(api, 'PATCH', `/bancos/${randomUUID()}`, {
      token,
      cuerpo: { nombre: 'No existe' },
    });

    expect(respuesta.statusCode).toBe(404);
  });
});

describe('desactivar y reactivar banco', () => {
  it('desactiva, y desactivar dos veces no falla', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const creado = await llamar(api, 'POST', '/bancos', {
      token,
      cuerpo: { codigo: codigoUnico(), nombre: 'Banco a Desactivar' },
    });
    const { banco } = creado.json<{ banco: BancoJson }>();

    const primera = await llamar(api, 'POST', `/bancos/${banco.id}/desactivar`, { token });
    const segunda = await llamar(api, 'POST', `/bancos/${banco.id}/desactivar`, { token });

    expect(primera.json<{ banco: BancoJson }>().banco.activo).toBe(false);
    expect(segunda.statusCode).toBe(200);
    expect(segunda.json<{ banco: BancoJson }>().banco.activo).toBe(false);
    // Desactivar un banco ya inactivo no genera un segundo registro en la bitácora.
    const registros = await prisma.auditoria.findMany({
      where: { accion: 'banco.desactivar', entidadId: banco.id },
    });
    expect(registros).toHaveLength(1);
  });

  it('reactiva un banco desactivado', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const creado = await llamar(api, 'POST', '/bancos', {
      token,
      cuerpo: { codigo: codigoUnico(), nombre: 'Banco a Reactivar' },
    });
    const { banco } = creado.json<{ banco: BancoJson }>();
    await llamar(api, 'POST', `/bancos/${banco.id}/desactivar`, { token });

    const respuesta = await llamar(api, 'POST', `/bancos/${banco.id}/reactivar`, { token });

    expect(respuesta.json<{ banco: BancoJson }>().banco.activo).toBe(true);
  });
});
