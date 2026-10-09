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

async function administradorConSesion(): Promise<{ token: string }> {
  const admin = await crearUsuarioDePrueba(prisma, { rol: 'administrador' });
  return { token: await abrirSesion(prisma, admin.id) };
}

interface LineaNegocioJson {
  id: string;
  nombre: string;
  clase: string;
  monedaOrigen: string;
  monedaDestino: string;
  activa: boolean;
  modoTasa: string;
  margenCompra: string | null;
  margenVenta: string | null;
}

describe('acceso a la API de líneas de negocio', () => {
  const idCualquiera = randomUUID();
  const rutas: ['GET' | 'POST' | 'PATCH', string][] = [
    ['GET', '/lineas-negocio'],
    ['POST', '/lineas-negocio'],
    ['PATCH', `/lineas-negocio/${idCualquiera}`],
    ['PATCH', `/lineas-negocio/${idCualquiera}/configuracion-tasa`],
    ['POST', `/lineas-negocio/${idCualquiera}/desactivar`],
    ['POST', `/lineas-negocio/${idCualquiera}/reactivar`],
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

describe('crear línea de negocio', () => {
  it('crea la línea activa por defecto', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const nombre = nombreUnico();

    const respuesta = await llamar(api, 'POST', '/lineas-negocio', {
      token,
      cuerpo: { nombre, clase: 'remesa', monedaOrigen: 'COP', monedaDestino: 'VES' },
    });

    expect(respuesta.statusCode).toBe(201);
    const { lineaNegocio } = respuesta.json<{ lineaNegocio: LineaNegocioJson }>();
    expect(lineaNegocio).toMatchObject({
      nombre,
      clase: 'remesa',
      monedaOrigen: 'COP',
      monedaDestino: 'VES',
      activa: true,
    });
  });

  it('rechaza una clase que no existe', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();

    const respuesta = await llamar(api, 'POST', '/lineas-negocio', {
      token,
      cuerpo: { nombre: nombreUnico(), clase: 'otra', monedaOrigen: 'COP', monedaDestino: 'VES' },
    });

    expect(respuesta.statusCode).toBe(400);
  });

  it('rechaza un nombre repetido', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const nombre = nombreUnico();
    await llamar(api, 'POST', '/lineas-negocio', {
      token,
      cuerpo: { nombre, clase: 'remesa', monedaOrigen: 'COP', monedaDestino: 'VES' },
    });

    const respuesta = await llamar(api, 'POST', '/lineas-negocio', {
      token,
      cuerpo: { nombre, clase: 'divisa_caja', monedaOrigen: 'USD', monedaDestino: 'COP' },
    });

    expect(respuesta.statusCode).toBe(409);
    expect(cuerpoError(respuesta).codigo).toBe('VALOR_EN_USO');
  });

  it('queda registrada en la bitácora', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const nombre = nombreUnico();

    const respuesta = await llamar(api, 'POST', '/lineas-negocio', {
      token,
      cuerpo: { nombre, clase: 'remesa', monedaOrigen: 'COP', monedaDestino: 'VES' },
    });
    const { lineaNegocio } = respuesta.json<{ lineaNegocio: LineaNegocioJson }>();

    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'linea_negocio.crear', entidadId: lineaNegocio.id },
    });
    expect(registro.despues).toMatchObject({ nombre, clase: 'remesa' });
  });
});

describe('listar líneas de negocio', () => {
  it('filtra por clase y por activa', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const remesa = await llamar(api, 'POST', '/lineas-negocio', {
      token,
      cuerpo: { nombre: nombreUnico(), clase: 'remesa', monedaOrigen: 'COP', monedaDestino: 'VES' },
    });
    const divisa = await llamar(api, 'POST', '/lineas-negocio', {
      token,
      cuerpo: {
        nombre: nombreUnico(),
        clase: 'divisa_caja',
        monedaOrigen: 'USD',
        monedaDestino: 'COP',
      },
    });
    const { lineaNegocio: lineaRemesa } = remesa.json<{ lineaNegocio: LineaNegocioJson }>();
    const { lineaNegocio: lineaDivisa } = divisa.json<{ lineaNegocio: LineaNegocioJson }>();
    await llamar(api, 'POST', `/lineas-negocio/${lineaDivisa.id}/desactivar`, { token });

    const porClase = await llamar(api, 'GET', '/lineas-negocio?clase=remesa', { token });
    const idsPorClase = porClase
      .json<{ lineasNegocio: LineaNegocioJson[] }>()
      .lineasNegocio.map((l) => l.id);
    expect(idsPorClase).toContain(lineaRemesa.id);
    expect(idsPorClase).not.toContain(lineaDivisa.id);

    const soloInactivas = await llamar(api, 'GET', '/lineas-negocio?activa=false', { token });
    expect(
      soloInactivas.json<{ lineasNegocio: LineaNegocioJson[] }>().lineasNegocio.map((l) => l.id),
    ).toContain(lineaDivisa.id);
  });
});

describe('editar línea de negocio', () => {
  it('cambia el nombre y registra antes/después en la bitácora', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const creada = await llamar(api, 'POST', '/lineas-negocio', {
      token,
      cuerpo: {
        nombre: nombreUnico('Vieja'),
        clase: 'remesa',
        monedaOrigen: 'COP',
        monedaDestino: 'VES',
      },
    });
    const { lineaNegocio } = creada.json<{ lineaNegocio: LineaNegocioJson }>();
    const nombreNuevo = nombreUnico('Nueva');

    const respuesta = await llamar(api, 'PATCH', `/lineas-negocio/${lineaNegocio.id}`, {
      token,
      cuerpo: { nombre: nombreNuevo },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json<{ lineaNegocio: LineaNegocioJson }>().lineaNegocio.nombre).toBe(
      nombreNuevo,
    );
    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'linea_negocio.editar', entidadId: lineaNegocio.id },
    });
    expect(registro.despues).toMatchObject({ nombre: nombreNuevo });
  });

  it('una línea que no existe responde 404', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();

    const respuesta = await llamar(api, 'PATCH', `/lineas-negocio/${randomUUID()}`, {
      token,
      cuerpo: { nombre: 'No existe' },
    });

    expect(respuesta.statusCode).toBe(404);
  });
});

describe('desactivar y reactivar línea de negocio', () => {
  it('desactiva, y desactivarla dos veces no falla', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const creada = await llamar(api, 'POST', '/lineas-negocio', {
      token,
      cuerpo: {
        nombre: nombreUnico(),
        clase: 'remesa',
        monedaOrigen: 'COP',
        monedaDestino: 'VES',
      },
    });
    const { lineaNegocio } = creada.json<{ lineaNegocio: LineaNegocioJson }>();

    const primera = await llamar(api, 'POST', `/lineas-negocio/${lineaNegocio.id}/desactivar`, {
      token,
    });
    const segunda = await llamar(api, 'POST', `/lineas-negocio/${lineaNegocio.id}/desactivar`, {
      token,
    });

    expect(primera.json<{ lineaNegocio: LineaNegocioJson }>().lineaNegocio.activa).toBe(false);
    expect(segunda.statusCode).toBe(200);
    const registros = await prisma.auditoria.findMany({
      where: { accion: 'linea_negocio.desactivar', entidadId: lineaNegocio.id },
    });
    expect(registros).toHaveLength(1);
  });

  it('reactiva una línea desactivada', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const creada = await llamar(api, 'POST', '/lineas-negocio', {
      token,
      cuerpo: {
        nombre: nombreUnico(),
        clase: 'remesa',
        monedaOrigen: 'COP',
        monedaDestino: 'VES',
      },
    });
    const { lineaNegocio } = creada.json<{ lineaNegocio: LineaNegocioJson }>();
    await llamar(api, 'POST', `/lineas-negocio/${lineaNegocio.id}/desactivar`, { token });

    const respuesta = await llamar(api, 'POST', `/lineas-negocio/${lineaNegocio.id}/reactivar`, {
      token,
    });

    expect(respuesta.json<{ lineaNegocio: LineaNegocioJson }>().lineaNegocio.activa).toBe(true);
  });
});

describe('configurar el modo de tasa y el margen', () => {
  async function crearLinea(api: FastifyInstance, token: string) {
    const creada = await llamar(api, 'POST', '/lineas-negocio', {
      token,
      cuerpo: {
        nombre: nombreUnico(),
        clase: 'remesa',
        monedaOrigen: 'COP',
        monedaDestino: 'VES',
      },
    });
    return creada.json<{ lineaNegocio: LineaNegocioJson }>().lineaNegocio;
  }

  it('por defecto una línea nueva queda en modo directo, sin margen', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const linea = await crearLinea(api, token);

    expect(linea).toMatchObject({ modoTasa: 'directo', margenCompra: null, margenVenta: null });
  });

  it('pasa a modo porcentaje con margen de venta', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const linea = await crearLinea(api, token);

    const respuesta = await llamar(api, 'PATCH', `/lineas-negocio/${linea.id}/configuracion-tasa`, {
      token,
      cuerpo: { modoTasa: 'porcentaje', margenVenta: '11' },
    });

    expect(respuesta.statusCode).toBe(200);
    const { lineaNegocio } = respuesta.json<{ lineaNegocio: LineaNegocioJson }>();
    expect(lineaNegocio.modoTasa).toBe('porcentaje');
    expect(lineaNegocio.margenVenta).toBe('11.000000');
    expect(lineaNegocio.margenCompra).toBeNull();
  });

  it('modo porcentaje sin margenVenta se rechaza', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const linea = await crearLinea(api, token);

    const respuesta = await llamar(api, 'PATCH', `/lineas-negocio/${linea.id}/configuracion-tasa`, {
      token,
      cuerpo: { modoTasa: 'porcentaje' },
    });

    expect(respuesta.statusCode).toBe(400);
  });

  it('volver a modo directo limpia los márgenes guardados', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const linea = await crearLinea(api, token);
    await llamar(api, 'PATCH', `/lineas-negocio/${linea.id}/configuracion-tasa`, {
      token,
      cuerpo: { modoTasa: 'porcentaje', margenVenta: '11' },
    });

    const respuesta = await llamar(api, 'PATCH', `/lineas-negocio/${linea.id}/configuracion-tasa`, {
      token,
      cuerpo: { modoTasa: 'directo' },
    });

    const { lineaNegocio } = respuesta.json<{ lineaNegocio: LineaNegocioJson }>();
    expect(lineaNegocio).toMatchObject({
      modoTasa: 'directo',
      margenCompra: null,
      margenVenta: null,
    });
  });

  it('queda registrado en la bitácora', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const linea = await crearLinea(api, token);

    await llamar(api, 'PATCH', `/lineas-negocio/${linea.id}/configuracion-tasa`, {
      token,
      cuerpo: { modoTasa: 'porcentaje', margenVenta: '11' },
    });

    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'linea_negocio.configurar_tasa', entidadId: linea.id },
    });
    expect(registro.despues).toMatchObject({ modoTasa: 'porcentaje', margenVenta: '11.000000' });
  });
});
