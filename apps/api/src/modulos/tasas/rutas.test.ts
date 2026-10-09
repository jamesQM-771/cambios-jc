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

const nombreUnico = (prefijo = 'Linea') => `${prefijo} ${randomUUID().slice(0, 8)}`;

async function administradorConSesion(): Promise<{ token: string; id: string }> {
  const admin = await crearUsuarioDePrueba(prisma, { rol: 'administrador' });
  return { token: await abrirSesion(prisma, admin.id), id: admin.id };
}

interface LineaNegocioJson {
  id: string;
}

interface TasaJson {
  id: string;
  lineaNegocioId: string;
  lineaNegocioNombre: string;
  tasaReferencia: string | null;
  margenUsado: string | null;
  tasaCompra: string | null;
  tasaVenta: string;
  publicadaPorId: string;
  motivo: string | null;
  vigenteDesde: string;
  vigenteHasta: string | null;
}

async function lineaPorcentaje(api: FastifyInstance, token: string, margenVenta = '11') {
  const creada = await llamar(api, 'POST', '/lineas-negocio', {
    token,
    cuerpo: { nombre: nombreUnico(), clase: 'remesa', monedaOrigen: 'COP', monedaDestino: 'VES' },
  });
  const { lineaNegocio } = creada.json<{ lineaNegocio: LineaNegocioJson }>();
  await llamar(api, 'PATCH', `/lineas-negocio/${lineaNegocio.id}/configuracion-tasa`, {
    token,
    cuerpo: { modoTasa: 'porcentaje', margenVenta },
  });
  return lineaNegocio;
}

async function lineaDirecta(api: FastifyInstance, token: string) {
  const creada = await llamar(api, 'POST', '/lineas-negocio', {
    token,
    cuerpo: {
      nombre: nombreUnico(),
      clase: 'divisa_caja',
      monedaOrigen: 'USD',
      monedaDestino: 'COP',
    },
  });
  return creada.json<{ lineaNegocio: LineaNegocioJson }>().lineaNegocio;
}

describe('acceso a la API de tasas', () => {
  const rutas: ['GET' | 'POST', string][] = [
    ['GET', '/tasas'],
    ['POST', '/tasas'],
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

describe('publicar tasa — modo porcentaje', () => {
  it('calcula la venta: proveedor 4,68 + margen 11 % = 5,19', async () => {
    const { token, id: publicadaPorId } = await administradorConSesion();
    const api = nuevaApp();
    const linea = await lineaPorcentaje(api, token, '11');

    const respuesta = await llamar(api, 'POST', '/tasas', {
      token,
      cuerpo: { modoTasa: 'porcentaje', lineaNegocioId: linea.id, tasaReferencia: '4.68' },
    });

    expect(respuesta.statusCode).toBe(201);
    const { tasa } = respuesta.json<{ tasa: TasaJson }>();
    expect(tasa).toMatchObject({
      lineaNegocioId: linea.id,
      tasaReferencia: '4.680000',
      margenUsado: '11.000000',
      tasaCompra: null,
      tasaVenta: '5.190000',
      publicadaPorId,
      vigenteHasta: null,
    });
  });

  it('sin margen configurado, se niega', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const creada = await llamar(api, 'POST', '/lineas-negocio', {
      token,
      cuerpo: { nombre: nombreUnico(), clase: 'remesa', monedaOrigen: 'COP', monedaDestino: 'VES' },
    });
    const { lineaNegocio } = creada.json<{ lineaNegocio: LineaNegocioJson }>();
    await llamar(api, 'PATCH', `/lineas-negocio/${lineaNegocio.id}/configuracion-tasa`, {
      token,
      cuerpo: { modoTasa: 'porcentaje', margenVenta: '5' },
    });
    // Se vuelve a "directo" para dejarla sin margen configurado, y luego se fuerza porcentaje
    // enviando el body directamente a la base para simular el caso "nunca se configuró".
    await prisma.lineaNegocio.update({
      where: { id: lineaNegocio.id },
      data: { modoTasa: 'porcentaje', margenVenta: null },
    });

    const respuesta = await llamar(api, 'POST', '/tasas', {
      token,
      cuerpo: { modoTasa: 'porcentaje', lineaNegocioId: lineaNegocio.id, tasaReferencia: '4.68' },
    });

    expect(respuesta.statusCode).toBe(409);
    expect(cuerpoError(respuesta).codigo).toBe('ESTADO_INVALIDO');
  });

  it('el modo enviado debe coincidir con el de la línea', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const linea = await lineaDirecta(api, token);

    const respuesta = await llamar(api, 'POST', '/tasas', {
      token,
      cuerpo: { modoTasa: 'porcentaje', lineaNegocioId: linea.id, tasaReferencia: '4.68' },
    });

    expect(respuesta.statusCode).toBe(409);
    expect(cuerpoError(respuesta).codigo).toBe('ESTADO_INVALIDO');
  });
});

describe('publicar tasa — modo directo', () => {
  it('guarda compra y venta tal como se enviaron', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const linea = await lineaDirecta(api, token);

    const respuesta = await llamar(api, 'POST', '/tasas', {
      token,
      cuerpo: {
        modoTasa: 'directo',
        lineaNegocioId: linea.id,
        tasaCompra: '3000',
        tasaVenta: '3200',
      },
    });

    expect(respuesta.statusCode).toBe(201);
    const { tasa } = respuesta.json<{ tasa: TasaJson }>();
    expect(tasa).toMatchObject({
      tasaReferencia: null,
      margenUsado: null,
      tasaCompra: '3000.000000',
      tasaVenta: '3200.000000',
    });
  });

  it('tasaCompra es opcional', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const linea = await lineaDirecta(api, token);

    const respuesta = await llamar(api, 'POST', '/tasas', {
      token,
      cuerpo: { modoTasa: 'directo', lineaNegocioId: linea.id, tasaVenta: '3200' },
    });

    expect(respuesta.statusCode).toBe(201);
    expect(respuesta.json<{ tasa: TasaJson }>().tasa.tasaCompra).toBeNull();
  });
});

describe('historial de tasas', () => {
  it('publicar una tasa nueva cierra la vigencia de la anterior, sin borrarla', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const linea = await lineaPorcentaje(api, token);

    const primera = await llamar(api, 'POST', '/tasas', {
      token,
      cuerpo: { modoTasa: 'porcentaje', lineaNegocioId: linea.id, tasaReferencia: '4.68' },
    });
    const segunda = await llamar(api, 'POST', '/tasas', {
      token,
      cuerpo: {
        modoTasa: 'porcentaje',
        lineaNegocioId: linea.id,
        tasaReferencia: '4.70',
        motivo: 'Cambio manual del día',
      },
    });

    const { tasa: tasaPrimera } = primera.json<{ tasa: TasaJson }>();
    const { tasa: tasaSegunda } = segunda.json<{ tasa: TasaJson }>();

    const todas = await llamar(api, 'GET', `/tasas?lineaNegocioId=${linea.id}`, { token });
    const lista = todas.json<{ tasas: TasaJson[] }>().tasas;
    expect(lista).toHaveLength(2);
    const guardadaPrimera = lista.find((t) => t.id === tasaPrimera.id);
    expect(guardadaPrimera?.vigenteHasta).not.toBeNull();
    expect(tasaSegunda.vigenteHasta).toBeNull();
    expect(tasaSegunda.motivo).toBe('Cambio manual del día');

    const soloVigente = await llamar(api, 'GET', `/tasas?lineaNegocioId=${linea.id}&vigente=true`, {
      token,
    });
    const vigentes = soloVigente.json<{ tasas: TasaJson[] }>().tasas;
    expect(vigentes.map((t) => t.id)).toEqual([tasaSegunda.id]);
  });

  it('queda registrado en la bitácora', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const linea = await lineaPorcentaje(api, token);

    const respuesta = await llamar(api, 'POST', '/tasas', {
      token,
      cuerpo: { modoTasa: 'porcentaje', lineaNegocioId: linea.id, tasaReferencia: '4.68' },
    });
    const { tasa } = respuesta.json<{ tasa: TasaJson }>();

    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'tasa.publicar', entidadId: tasa.id },
    });
    expect(registro.despues).toMatchObject({ tasaVenta: '5.190000' });
  });
});
