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

const nombreUnico = (prefijo = 'Cuenta') => `${prefijo} ${randomUUID().slice(0, 8)}`;

async function administradorConSesion(): Promise<{ token: string }> {
  const admin = await crearUsuarioDePrueba(prisma, { rol: 'administrador' });
  return { token: await abrirSesion(prisma, admin.id) };
}

async function sucursalDePrueba(activa = true) {
  return prisma.sucursal.create({
    data: { nombre: nombreUnico('Sucursal'), ciudad: 'Cúcuta', activa },
  });
}

async function bancoDePrueba(activo = true) {
  return prisma.banco.create({
    data: {
      codigo: String(1000 + Math.floor(Math.random() * 8999)),
      nombre: nombreUnico('Banco'),
      activo,
    },
  });
}

interface CuentaJson {
  id: string;
  nombre: string;
  tipo: string;
  moneda: string;
  bancoId: string | null;
  bancoNombre: string | null;
  ultimos4Digitos: string | null;
  sucursalId: string;
  titular: string | null;
  activa: boolean;
  limiteDiario: string | null;
  comisionPorDefecto: string | null;
}

describe('acceso a la API de cuentas de dinero', () => {
  const idCualquiera = randomUUID();
  const rutas: ['GET' | 'POST' | 'PATCH', string][] = [
    ['GET', '/cuentas-dinero'],
    ['POST', '/cuentas-dinero'],
    ['PATCH', `/cuentas-dinero/${idCualquiera}`],
    ['POST', `/cuentas-dinero/${idCualquiera}/desactivar`],
    ['POST', `/cuentas-dinero/${idCualquiera}/reactivar`],
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

describe('crear cuenta de dinero', () => {
  it('crea una cuenta tipo caja, sin banco', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();

    const respuesta = await llamar(api, 'POST', '/cuentas-dinero', {
      token,
      cuerpo: { tipo: 'caja', nombre: nombreUnico(), moneda: 'COP', sucursalId: sucursal.id },
    });

    expect(respuesta.statusCode).toBe(201);
    const { cuenta } = respuesta.json<{ cuenta: CuentaJson }>();
    expect(cuenta).toMatchObject({
      tipo: 'caja',
      moneda: 'COP',
      bancoId: null,
      ultimos4Digitos: null,
      activa: true,
    });
  });

  it('crea una cuenta tipo banco con bancoId y últimos 4 dígitos', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();
    const banco = await bancoDePrueba();

    const respuesta = await llamar(api, 'POST', '/cuentas-dinero', {
      token,
      cuerpo: {
        tipo: 'banco',
        nombre: nombreUnico(),
        moneda: 'VES',
        sucursalId: sucursal.id,
        bancoId: banco.id,
        ultimos4Digitos: '4441',
      },
    });

    expect(respuesta.statusCode).toBe(201);
    const { cuenta } = respuesta.json<{ cuenta: CuentaJson }>();
    expect(cuenta).toMatchObject({
      tipo: 'banco',
      bancoId: banco.id,
      bancoNombre: banco.nombre,
      ultimos4Digitos: '4441',
    });
  });

  it('una cuenta tipo caja o billetera no acepta bancoId (el esquema lo rechaza)', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();
    const banco = await bancoDePrueba();

    const respuesta = await llamar(api, 'POST', '/cuentas-dinero', {
      token,
      cuerpo: {
        tipo: 'caja',
        nombre: nombreUnico(),
        moneda: 'COP',
        sucursalId: sucursal.id,
        bancoId: banco.id,
      },
    });

    expect(respuesta.statusCode).toBe(400);
  });

  it('una cuenta tipo banco sin bancoId se rechaza', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();

    const respuesta = await llamar(api, 'POST', '/cuentas-dinero', {
      token,
      cuerpo: {
        tipo: 'banco',
        nombre: nombreUnico(),
        moneda: 'VES',
        sucursalId: sucursal.id,
        ultimos4Digitos: '4441',
      },
    });

    expect(respuesta.statusCode).toBe(400);
  });

  it('no se puede crear en una sucursal inactiva', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba(false);

    const respuesta = await llamar(api, 'POST', '/cuentas-dinero', {
      token,
      cuerpo: { tipo: 'caja', nombre: nombreUnico(), moneda: 'COP', sucursalId: sucursal.id },
    });

    expect(respuesta.statusCode).toBe(400);
  });

  it('no se puede crear con un banco inactivo', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();
    const banco = await bancoDePrueba(false);

    const respuesta = await llamar(api, 'POST', '/cuentas-dinero', {
      token,
      cuerpo: {
        tipo: 'banco',
        nombre: nombreUnico(),
        moneda: 'VES',
        sucursalId: sucursal.id,
        bancoId: banco.id,
        ultimos4Digitos: '4441',
      },
    });

    expect(respuesta.statusCode).toBe(400);
  });

  it('guarda el límite diario y la comisión fijados a la precisión de la moneda', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();

    const respuesta = await llamar(api, 'POST', '/cuentas-dinero', {
      token,
      cuerpo: {
        tipo: 'caja',
        nombre: nombreUnico(),
        moneda: 'COP',
        sucursalId: sucursal.id,
        limiteDiario: '5000000',
        comisionPorDefecto: '5000',
      },
    });

    const { cuenta } = respuesta.json<{ cuenta: CuentaJson }>();
    expect(cuenta.limiteDiario).toBe('5000000.00');
    expect(cuenta.comisionPorDefecto).toBe('5000.00');
  });

  it('queda registrada en la bitácora', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();
    const nombre = nombreUnico();

    const respuesta = await llamar(api, 'POST', '/cuentas-dinero', {
      token,
      cuerpo: { tipo: 'caja', nombre, moneda: 'COP', sucursalId: sucursal.id },
    });
    const { cuenta } = respuesta.json<{ cuenta: CuentaJson }>();

    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'cuenta_dinero.crear', entidadId: cuenta.id },
    });
    expect(registro.despues).toMatchObject({ nombre, tipo: 'caja' });
  });
});

describe('listar cuentas de dinero', () => {
  it('filtra por moneda, sucursal, tipo y activa', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();
    const creada = await llamar(api, 'POST', '/cuentas-dinero', {
      token,
      cuerpo: { tipo: 'billetera', nombre: nombreUnico(), moneda: 'USD', sucursalId: sucursal.id },
    });
    const { cuenta } = creada.json<{ cuenta: CuentaJson }>();
    await llamar(api, 'POST', `/cuentas-dinero/${cuenta.id}/desactivar`, { token });

    const porMoneda = await llamar(api, 'GET', '/cuentas-dinero?moneda=USD', { token });
    expect(porMoneda.json<{ cuentas: CuentaJson[] }>().cuentas.map((c) => c.id)).toContain(
      cuenta.id,
    );

    const soloActivas = await llamar(api, 'GET', '/cuentas-dinero?activa=true', { token });
    expect(soloActivas.json<{ cuentas: CuentaJson[] }>().cuentas.map((c) => c.id)).not.toContain(
      cuenta.id,
    );
  });
});

describe('editar cuenta de dinero', () => {
  it('cambia la comisión y registra antes/después en la bitácora', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();
    const creada = await llamar(api, 'POST', '/cuentas-dinero', {
      token,
      cuerpo: {
        tipo: 'caja',
        nombre: nombreUnico(),
        moneda: 'COP',
        sucursalId: sucursal.id,
        comisionPorDefecto: '3000',
      },
    });
    const { cuenta } = creada.json<{ cuenta: CuentaJson }>();

    const respuesta = await llamar(api, 'PATCH', `/cuentas-dinero/${cuenta.id}`, {
      token,
      cuerpo: { comisionPorDefecto: '5000' },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json<{ cuenta: CuentaJson }>().cuenta.comisionPorDefecto).toBe('5000.00');
    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'cuenta_dinero.editar', entidadId: cuenta.id },
    });
    expect(registro.antes).toMatchObject({ comisionPorDefecto: '3000.00' });
    expect(registro.despues).toMatchObject({ comisionPorDefecto: '5000.00' });
  });

  it('quitar la comisión con null la deja sin comisión', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();
    const creada = await llamar(api, 'POST', '/cuentas-dinero', {
      token,
      cuerpo: {
        tipo: 'caja',
        nombre: nombreUnico(),
        moneda: 'COP',
        sucursalId: sucursal.id,
        comisionPorDefecto: '3000',
      },
    });
    const { cuenta } = creada.json<{ cuenta: CuentaJson }>();

    const respuesta = await llamar(api, 'PATCH', `/cuentas-dinero/${cuenta.id}`, {
      token,
      cuerpo: { comisionPorDefecto: null },
    });

    expect(respuesta.json<{ cuenta: CuentaJson }>().cuenta.comisionPorDefecto).toBeNull();
  });

  it('una cuenta que no es banco no acepta últimos4Digitos', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();
    const creada = await llamar(api, 'POST', '/cuentas-dinero', {
      token,
      cuerpo: { tipo: 'caja', nombre: nombreUnico(), moneda: 'COP', sucursalId: sucursal.id },
    });
    const { cuenta } = creada.json<{ cuenta: CuentaJson }>();

    const respuesta = await llamar(api, 'PATCH', `/cuentas-dinero/${cuenta.id}`, {
      token,
      cuerpo: { ultimos4Digitos: '1234' },
    });

    expect(respuesta.statusCode).toBe(400);
  });

  it('una cuenta que no existe responde 404', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();

    const respuesta = await llamar(api, 'PATCH', `/cuentas-dinero/${randomUUID()}`, {
      token,
      cuerpo: { nombre: 'No existe' },
    });

    expect(respuesta.statusCode).toBe(404);
  });
});

describe('desactivar y reactivar cuenta de dinero', () => {
  it('desactiva, y desactivarla dos veces no falla', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();
    const creada = await llamar(api, 'POST', '/cuentas-dinero', {
      token,
      cuerpo: { tipo: 'caja', nombre: nombreUnico(), moneda: 'COP', sucursalId: sucursal.id },
    });
    const { cuenta } = creada.json<{ cuenta: CuentaJson }>();

    const primera = await llamar(api, 'POST', `/cuentas-dinero/${cuenta.id}/desactivar`, {
      token,
    });
    const segunda = await llamar(api, 'POST', `/cuentas-dinero/${cuenta.id}/desactivar`, {
      token,
    });

    expect(primera.json<{ cuenta: CuentaJson }>().cuenta.activa).toBe(false);
    expect(segunda.statusCode).toBe(200);
    const registros = await prisma.auditoria.findMany({
      where: { accion: 'cuenta_dinero.desactivar', entidadId: cuenta.id },
    });
    expect(registros).toHaveLength(1);
  });

  it('reactiva una cuenta desactivada', async () => {
    const { token } = await administradorConSesion();
    const api = nuevaApp();
    const sucursal = await sucursalDePrueba();
    const creada = await llamar(api, 'POST', '/cuentas-dinero', {
      token,
      cuerpo: { tipo: 'caja', nombre: nombreUnico(), moneda: 'COP', sucursalId: sucursal.id },
    });
    const { cuenta } = creada.json<{ cuenta: CuentaJson }>();
    await llamar(api, 'POST', `/cuentas-dinero/${cuenta.id}/desactivar`, { token });

    const respuesta = await llamar(api, 'POST', `/cuentas-dinero/${cuenta.id}/reactivar`, {
      token,
    });

    expect(respuesta.json<{ cuenta: CuentaJson }>().cuenta.activa).toBe(true);
  });
});
