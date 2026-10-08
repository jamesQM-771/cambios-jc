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

// La semilla de cada moneda ya ocupa valores "redondos" reales; estas pruebas usan valores que no
// coinciden con ningún billete real, para no chocar con la semilla ni con otras pruebas.
const semillaValor = Date.now() % 100_000;
let contadorValor = 0;
const valorUnico = (): string => {
  contadorValor += 1;
  return String(900_000_000 + ((semillaValor + contadorValor) % 90_000_000));
};

async function administradorConSesion(): Promise<{ token: string }> {
  const admin = await crearUsuarioDePrueba(prisma, { rol: 'administrador' });
  return { token: await abrirSesion(prisma, admin.id) };
}

interface DenominacionJson {
  id: string;
  moneda: string;
  valor: string;
  activa: boolean;
}

describe('acceso a la API de denominaciones', () => {
  const idCualquiera = randomUUID();
  const rutas: ['GET' | 'POST' | 'PATCH', string][] = [
    ['GET', '/denominaciones'],
    ['POST', '/denominaciones'],
    ['PATCH', `/denominaciones/${idCualquiera}`],
    ['POST', `/denominaciones/${idCualquiera}/desactivar`],
    ['POST', `/denominaciones/${idCualquiera}/reactivar`],
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

describe('crear denominación', () => {
  it('crea una denominación activa con los decimales de su moneda', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const valor = valorUnico();

    const respuesta = await llamar(api, 'POST', '/denominaciones', {
      token,
      cuerpo: { moneda: 'COP', valor },
    });

    expect(respuesta.statusCode).toBe(201);
    const { denominacion } = respuesta.json<{ denominacion: DenominacionJson }>();
    expect(denominacion).toMatchObject({ moneda: 'COP', valor: `${valor}.00`, activa: true });
  });

  it('VES se guarda con 3 decimales', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const valor = valorUnico();

    const respuesta = await llamar(api, 'POST', '/denominaciones', {
      token,
      cuerpo: { moneda: 'VES', valor },
    });

    expect(respuesta.json<{ denominacion: DenominacionJson }>().denominacion.valor).toBe(
      `${valor}.000`,
    );
  });

  it('rechaza un valor con letras o negativo', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();

    const conLetras = await llamar(api, 'POST', '/denominaciones', {
      token,
      cuerpo: { moneda: 'COP', valor: 'abc' },
    });
    const negativo = await llamar(api, 'POST', '/denominaciones', {
      token,
      cuerpo: { moneda: 'COP', valor: '-100' },
    });

    expect(conLetras.statusCode).toBe(400);
    expect(negativo.statusCode).toBe(400);
  });

  it('rechaza una moneda repetida y activa', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const valor = valorUnico();
    await llamar(api, 'POST', '/denominaciones', { token, cuerpo: { moneda: 'COP', valor } });

    const respuesta = await llamar(api, 'POST', '/denominaciones', {
      token,
      cuerpo: { moneda: 'COP', valor },
    });

    expect(respuesta.statusCode).toBe(409);
    expect(cuerpoError(respuesta).codigo).toBe('VALOR_EN_USO');
  });

  it('el mismo valor en otra moneda sí se puede crear', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const valor = valorUnico();
    await llamar(api, 'POST', '/denominaciones', { token, cuerpo: { moneda: 'COP', valor } });

    const respuesta = await llamar(api, 'POST', '/denominaciones', {
      token,
      cuerpo: { moneda: 'USD', valor },
    });

    expect(respuesta.statusCode).toBe(201);
  });

  it('queda registrada en la bitácora', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const valor = valorUnico();

    const respuesta = await llamar(api, 'POST', '/denominaciones', {
      token,
      cuerpo: { moneda: 'COP', valor },
    });
    const { denominacion } = respuesta.json<{ denominacion: DenominacionJson }>();

    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'denominacion.crear', entidadId: denominacion.id },
    });
    expect(registro.despues).toMatchObject({ moneda: 'COP', valor: `${valor}.00` });
  });
});

describe('listar denominaciones', () => {
  it('filtra por moneda y por activa', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const valorCop = valorUnico();
    const valorUsd = valorUnico();
    const creadaCop = await llamar(api, 'POST', '/denominaciones', {
      token,
      cuerpo: { moneda: 'COP', valor: valorCop },
    });
    const creadaUsd = await llamar(api, 'POST', '/denominaciones', {
      token,
      cuerpo: { moneda: 'USD', valor: valorUsd },
    });
    const { denominacion: denCop } = creadaCop.json<{ denominacion: DenominacionJson }>();
    const { denominacion: denUsd } = creadaUsd.json<{ denominacion: DenominacionJson }>();
    await llamar(api, 'POST', `/denominaciones/${denUsd.id}/desactivar`, { token });

    const porMoneda = await llamar(api, 'GET', '/denominaciones?moneda=COP', { token });
    const idsPorMoneda = porMoneda
      .json<{ denominaciones: DenominacionJson[] }>()
      .denominaciones.map((d) => d.id);
    expect(idsPorMoneda).toContain(denCop.id);
    expect(idsPorMoneda).not.toContain(denUsd.id);

    const soloInactivas = await llamar(api, 'GET', '/denominaciones?activa=false', { token });
    expect(
      soloInactivas.json<{ denominaciones: DenominacionJson[] }>().denominaciones.map((d) => d.id),
    ).toContain(denUsd.id);
  });
});

describe('editar denominación', () => {
  it('cambia el valor y registra antes/después en la bitácora', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const creada = await llamar(api, 'POST', '/denominaciones', {
      token,
      cuerpo: { moneda: 'COP', valor: valorUnico() },
    });
    const { denominacion } = creada.json<{ denominacion: DenominacionJson }>();
    const valorNuevo = valorUnico();

    const respuesta = await llamar(api, 'PATCH', `/denominaciones/${denominacion.id}`, {
      token,
      cuerpo: { valor: valorNuevo },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json<{ denominacion: DenominacionJson }>().denominacion.valor).toBe(
      `${valorNuevo}.00`,
    );
    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'denominacion.editar', entidadId: denominacion.id },
    });
    expect(registro.despues).toMatchObject({ valor: `${valorNuevo}.00` });
  });

  it('una denominación que no existe responde 404', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();

    const respuesta = await llamar(api, 'PATCH', `/denominaciones/${randomUUID()}`, {
      token,
      cuerpo: { valor: '1' },
    });

    expect(respuesta.statusCode).toBe(404);
  });
});

describe('desactivar y reactivar denominación', () => {
  it('desactiva, y desactivarla dos veces no falla', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const creada = await llamar(api, 'POST', '/denominaciones', {
      token,
      cuerpo: { moneda: 'COP', valor: valorUnico() },
    });
    const { denominacion } = creada.json<{ denominacion: DenominacionJson }>();

    const primera = await llamar(api, 'POST', `/denominaciones/${denominacion.id}/desactivar`, {
      token,
    });
    const segunda = await llamar(api, 'POST', `/denominaciones/${denominacion.id}/desactivar`, {
      token,
    });

    expect(primera.json<{ denominacion: DenominacionJson }>().denominacion.activa).toBe(false);
    expect(segunda.statusCode).toBe(200);
    const registros = await prisma.auditoria.findMany({
      where: { accion: 'denominacion.desactivar', entidadId: denominacion.id },
    });
    expect(registros).toHaveLength(1);
  });

  it('reactiva una denominación desactivada', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const creada = await llamar(api, 'POST', '/denominaciones', {
      token,
      cuerpo: { moneda: 'COP', valor: valorUnico() },
    });
    const { denominacion } = creada.json<{ denominacion: DenominacionJson }>();
    await llamar(api, 'POST', `/denominaciones/${denominacion.id}/desactivar`, { token });

    const respuesta = await llamar(api, 'POST', `/denominaciones/${denominacion.id}/reactivar`, {
      token,
    });

    expect(respuesta.json<{ denominacion: DenominacionJson }>().denominacion.activa).toBe(true);
  });

  it('no se puede reactivar si mientras tanto se creó otra activa con el mismo valor', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const valor = valorUnico();
    const creada = await llamar(api, 'POST', '/denominaciones', {
      token,
      cuerpo: { moneda: 'COP', valor },
    });
    const { denominacion } = creada.json<{ denominacion: DenominacionJson }>();
    await llamar(api, 'POST', `/denominaciones/${denominacion.id}/desactivar`, { token });
    await llamar(api, 'POST', '/denominaciones', { token, cuerpo: { moneda: 'COP', valor } });

    const respuesta = await llamar(api, 'POST', `/denominaciones/${denominacion.id}/reactivar`, {
      token,
    });

    expect(respuesta.statusCode).toBe(409);
    expect(cuerpoError(respuesta).codigo).toBe('VALOR_EN_USO');
  });
});
