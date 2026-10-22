import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { cerrarApp, crearAppPrueba } from '../../../test/ayudas.js';
import {
  abrirSesion,
  aTexto,
  asegurarEmpresa,
  crearUsuarioDePrueba,
  cuerpoError,
  llamar,
} from '../../../test/auth.js';
import { registrarMovimiento } from '../../lib/libro.js';
import { crearPrisma, type PrismaClient } from '../../lib/prisma.js';

import { fechaEnZona } from './servicio.js';

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

const unico = () => randomUUID().slice(0, 8);

interface Sesion {
  id: string;
  token: string;
  nombre: string;
}

async function sesion(rol: 'administrador' | 'vendedor' | 'digitador'): Promise<Sesion> {
  const usuario = await crearUsuarioDePrueba(prisma, { rol });
  return {
    id: usuario.id,
    token: await abrirSesion(prisma, usuario.id),
    nombre: 'Usuario de prueba',
  };
}

interface Escenario {
  sucursalId: string;
  cajaId: string;
  cuentaId: string;
  /** Denominaciones COP propias de la prueba. */
  de50000: string;
  de20000: string;
  usdDe87: string;
  vendedor: Sesion;
  admin: Sesion;
}

/** Una sucursal con una caja que tiene efectivo en pesos, y las denominaciones para contarlo. */
async function escenario(): Promise<Escenario> {
  const [vendedor, admin] = await Promise.all([sesion('vendedor'), sesion('administrador')]);
  const sucursal = await prisma.sucursal.create({
    data: { nombre: `Sucursal ${unico()}`, ciudad: 'Cúcuta' },
  });
  const caja = await prisma.caja.create({
    data: { nombre: `Caja ${unico()}`, sucursalId: sucursal.id },
  });
  const cuenta = await prisma.cuentaDinero.create({
    data: {
      nombre: `Efectivo COP ${unico()}`,
      tipo: 'caja',
      moneda: 'COP',
      sucursalId: sucursal.id,
      cajaId: caja.id,
    },
  });
  const [de50000, de20000, usdDe87] = await Promise.all([
    prisma.denominacion.create({ data: { moneda: 'COP', valor: '50001' } }),
    prisma.denominacion.create({ data: { moneda: 'COP', valor: '20001' } }),
    prisma.denominacion.create({ data: { moneda: 'USD', valor: '87' } }),
  ]);
  return {
    sucursalId: sucursal.id,
    cajaId: caja.id,
    cuentaId: cuenta.id,
    de50000: de50000.id,
    de20000: de20000.id,
    usdDe87: usdDe87.id,
    vendedor,
    admin,
  };
}

const conteoCop = (e: Escenario, de50000: number, de20000: number) => ({
  moneda: 'COP',
  lineas: [
    { denominacionId: e.de50000, cantidad: de50000 },
    { denominacionId: e.de20000, cantidad: de20000 },
  ],
});

const cuerpoApertura = (e: Escenario, cambios: Record<string, unknown> = {}) => ({
  cajaId: e.cajaId,
  conteos: [conteoCop(e, 2, 3)],
  ...cambios,
});

interface TurnoJson {
  id: string;
  estado: string;
  caja: { id: string };
  usuario: { id: string };
  jornada: { id: string; fecha: string };
  saldos: {
    momento: string;
    moneda: string;
    esperado: string | null;
    contado: string;
    diferencia: string | null;
    explicacion: string | null;
    resultado: string | null;
  }[];
  cerradoPor: { id: string } | null;
  motivoCierre: string | null;
  conteos: { momento: string; moneda: string; valor: string; cantidad: number }[];
}

const turnoDe = (respuesta: { json: () => unknown }): TurnoJson =>
  (respuesta.json() as { turno: TurnoJson }).turno;

/** Un turno ya cerrado de esa caja, con lo que se contó al cerrarlo (lo esperado del siguiente). */
async function cierreAnterior(e: Escenario, contado: string) {
  const ayer = new Date(Date.now() - 24 * 3_600_000);
  const fecha = new Date(`${fechaEnZona(ayer, 'America/Bogota')}T00:00:00Z`);
  const jornada = await prisma.jornada.upsert({
    where: { sucursalId_fecha: { sucursalId: e.sucursalId, fecha } },
    update: {},
    create: { sucursalId: e.sucursalId, fecha, estado: 'cerrada' },
  });
  const turno = await prisma.turno.create({
    data: {
      cajaId: e.cajaId,
      usuarioId: e.vendedor.id,
      jornadaId: jornada.id,
      estado: 'cerrado',
      cerradoEn: ayer,
    },
  });
  await prisma.saldoTurno.create({
    data: { turnoId: turno.id, momento: 'cierre', moneda: 'COP', contado },
  });
}

describe('acceso a los turnos', () => {
  const id = randomUUID();
  const rutas: ['GET' | 'POST', string][] = [
    ['GET', '/turnos/opciones'],
    ['GET', '/turnos/actual'],
    ['POST', '/turnos'],
    ['GET', '/turnos'],
    ['GET', `/turnos/${id}`],
  ];

  it.each(rutas)('%s %s: sin sesión responde 401', async (metodo, url) => {
    expect((await llamar(nuevaApp(), metodo, url)).statusCode).toBe(401);
  });

  it('el digitador recibe 403 en todas: su trabajo no pasa por la caja', async () => {
    const { token } = await sesion('digitador');
    const api = nuevaApp();

    for (const [metodo, url] of rutas) {
      const respuesta = await llamar(api, metodo, url, { token });
      expect(respuesta.statusCode, `${metodo} ${url}`).toBe(403);
      expect(cuerpoError(respuesta).codigo).toBe('SIN_PERMISO');
    }
  });

  it('el vendedor no puede ver la lista de turnos de todos', async () => {
    const { token } = await sesion('vendedor');

    const respuesta = await llamar(nuevaApp(), 'GET', '/turnos', { token });

    expect(respuesta.statusCode).toBe(403);
  });
});

describe('abrir un turno', () => {
  it('cuenta el efectivo por denominación y calcula el total en el servidor', async () => {
    const e = await escenario();
    const api = nuevaApp();

    const respuesta = await llamar(api, 'POST', '/turnos', {
      token: e.vendedor.token,
      cuerpo: cuerpoApertura(e),
    });

    expect(respuesta.statusCode).toBe(201);
    const turno = turnoDe(respuesta);
    expect(turno).toMatchObject({ estado: 'abierto', caja: { id: e.cajaId } });
    expect(turno.usuario.id).toBe(e.vendedor.id);
    // 2 × 50.001 + 3 × 20.001 = 160.005
    expect(turno.saldos).toEqual([
      {
        momento: 'apertura',
        moneda: 'COP',
        esperado: null,
        contado: '160005.00',
        diferencia: null,
        explicacion: null,
        resultado: null,
      },
    ]);
    expect(turno.conteos).toEqual([
      { momento: 'apertura', moneda: 'COP', valor: '50001.000', cantidad: 2 },
      { momento: 'apertura', moneda: 'COP', valor: '20001.000', cantidad: 3 },
    ]);
    const actual = await llamar(api, 'GET', '/turnos/actual', { token: e.vendedor.token });
    expect(turnoDe(actual).id).toBe(turno.id);
  });

  it('el día del local es el de la zona de la empresa, y se abre solo', async () => {
    const e = await escenario();

    const respuesta = await llamar(nuevaApp(), 'POST', '/turnos', {
      token: e.vendedor.token,
      cuerpo: cuerpoApertura(e),
    });

    expect(turnoDe(respuesta).jornada.fecha).toBe(fechaEnZona(new Date(), 'America/Bogota'));
    const jornada = await prisma.jornada.findFirst({ where: { sucursalId: e.sucursalId } });
    expect(jornada?.estado).toBe('abierta');
  });

  it('dos cajas de la misma sucursal comparten la jornada del día', async () => {
    const e = await escenario();
    const otraCaja = await prisma.caja.create({
      data: { nombre: `Caja ${unico()}`, sucursalId: e.sucursalId },
    });
    await prisma.cuentaDinero.create({
      data: {
        nombre: `Efectivo ${unico()}`,
        tipo: 'caja',
        moneda: 'COP',
        sucursalId: e.sucursalId,
        cajaId: otraCaja.id,
      },
    });
    const api = nuevaApp();

    const primero = await llamar(api, 'POST', '/turnos', {
      token: e.vendedor.token,
      cuerpo: cuerpoApertura(e),
    });
    const segundo = await llamar(api, 'POST', '/turnos', {
      token: e.admin.token,
      cuerpo: cuerpoApertura(e, { cajaId: otraCaja.id }),
    });

    expect(turnoDe(primero).jornada.id).toBe(turnoDe(segundo).jornada.id);
    expect(await prisma.jornada.count({ where: { sucursalId: e.sucursalId } })).toBe(1);
  });

  it('registra la diferencia con el cierre anterior de esa caja: sobrante', async () => {
    const e = await escenario();
    await cierreAnterior(e, '150000.00');

    const respuesta = await llamar(nuevaApp(), 'POST', '/turnos', {
      token: e.vendedor.token,
      cuerpo: cuerpoApertura(e),
    });

    expect(turnoDe(respuesta).saldos[0]).toMatchObject({
      esperado: '150000.00',
      contado: '160005.00',
      diferencia: '10005.00',
    });
  });

  it('y un faltante sale en negativo; si cuadra, la diferencia es cero', async () => {
    const e = await escenario();
    await cierreAnterior(e, '170000.00');
    const api = nuevaApp();

    const faltante = await llamar(api, 'POST', '/turnos', {
      token: e.vendedor.token,
      cuerpo: cuerpoApertura(e),
    });
    const turnoFaltante = turnoDe(faltante);
    await prisma.turno.update({
      where: { id: turnoFaltante.id },
      data: { estado: 'cerrado', cerradoEn: new Date(), cajaEnUso: null, usuarioEnUso: null },
    });
    await prisma.saldoTurno.create({
      data: { turnoId: turnoFaltante.id, momento: 'cierre', moneda: 'COP', contado: '160005.00' },
    });
    const cuadrado = await llamar(api, 'POST', '/turnos', {
      token: e.vendedor.token,
      cuerpo: cuerpoApertura(e),
    });

    expect(turnoFaltante.saldos[0]?.diferencia).toBe('-9995.00');
    expect(turnoDe(cuadrado).saldos[0]).toMatchObject({
      esperado: '160005.00',
      diferencia: '0.00',
    });
  });

  it('un conteo en cero es válido: la caja puede abrir vacía', async () => {
    const e = await escenario();

    const respuesta = await llamar(nuevaApp(), 'POST', '/turnos', {
      token: e.vendedor.token,
      cuerpo: cuerpoApertura(e, { conteos: [conteoCop(e, 0, 0)] }),
    });

    expect(respuesta.statusCode).toBe(201);
    const turno = turnoDe(respuesta);
    expect(turno.saldos[0]?.contado).toBe('0.00');
    expect(turno.conteos).toEqual([]);
  });

  it('montos grandes conservan todos los decimales', async () => {
    const e = await escenario();

    const respuesta = await llamar(nuevaApp(), 'POST', '/turnos', {
      token: e.vendedor.token,
      cuerpo: cuerpoApertura(e, { conteos: [conteoCop(e, 999_999, 999_999)] }),
    });

    // 999.999 × 70.002 = 70.001.929.998
    expect(turnoDe(respuesta).saldos[0]?.contado).toBe('70001929998.00');
  });

  it('queda en la bitácora', async () => {
    const e = await escenario();
    const turno = turnoDe(
      await llamar(nuevaApp(), 'POST', '/turnos', {
        token: e.vendedor.token,
        cuerpo: cuerpoApertura(e),
      }),
    );

    const registro = await prisma.auditoria.findFirst({
      where: { accion: 'turno.abrir', entidadId: turno.id },
    });

    expect(registro?.usuarioId).toBe(e.vendedor.id);
    expect(aTexto(registro?.despues)).toContain('160005.00');
  });
});

describe('qué se rechaza al abrir', () => {
  const abrir = (e: Escenario, cuerpo: unknown) =>
    llamar(nuevaApp(), 'POST', '/turnos', { token: e.vendedor.token, cuerpo });

  it('falta contar una moneda de la caja, o se cuenta una que la caja no maneja', async () => {
    const e = await escenario();
    const usd = { moneda: 'USD', lineas: [{ denominacionId: e.usdDe87, cantidad: 1 }] };

    const sinContar = await abrir(e, cuerpoApertura(e, { conteos: [usd] }));
    const deMas = await abrir(e, cuerpoApertura(e, { conteos: [conteoCop(e, 1, 1), usd] }));

    expect(sinContar.statusCode).toBe(400);
    expect(cuerpoError(sinContar).detalles).toEqual([
      { campo: 'conteos', mensaje: 'Esta caja no maneja efectivo en USD.' },
    ]);
    expect(deMas.statusCode).toBe(400);
  });

  it('una moneda repetida, una denominación de otra moneda, repetida o inexistente', async () => {
    const e = await escenario();

    const monedaRepetida = await abrir(
      e,
      cuerpoApertura(e, { conteos: [conteoCop(e, 1, 1), conteoCop(e, 1, 1)] }),
    );
    const deOtraMoneda = await abrir(
      e,
      cuerpoApertura(e, {
        conteos: [{ moneda: 'COP', lineas: [{ denominacionId: e.usdDe87, cantidad: 1 }] }],
      }),
    );
    const repetida = await abrir(
      e,
      cuerpoApertura(e, {
        conteos: [
          {
            moneda: 'COP',
            lineas: [
              { denominacionId: e.de50000, cantidad: 1 },
              { denominacionId: e.de50000, cantidad: 2 },
            ],
          },
        ],
      }),
    );
    const inexistente = await abrir(
      e,
      cuerpoApertura(e, {
        conteos: [{ moneda: 'COP', lineas: [{ denominacionId: randomUUID(), cantidad: 1 }] }],
      }),
    );

    for (const respuesta of [monedaRepetida, deOtraMoneda, repetida, inexistente]) {
      expect(respuesta.statusCode).toBe(400);
      expect(cuerpoError(respuesta).codigo).toBe('VALIDACION_FALLIDA');
    }
  });

  it('una denominación desactivada no se puede contar', async () => {
    const e = await escenario();
    await prisma.denominacion.update({ where: { id: e.de20000 }, data: { activa: false } });

    const respuesta = await abrir(e, cuerpoApertura(e));

    expect(respuesta.statusCode).toBe(400);
  });

  it.each([
    ['cantidad negativa', -1],
    ['cantidad con decimales', 1.5],
    ['cantidad enorme', 10_000_000],
  ])('rechaza %s', async (_nombre, cantidad) => {
    const e = await escenario();

    const respuesta = await abrir(
      e,
      cuerpoApertura(e, {
        conteos: [{ moneda: 'COP', lineas: [{ denominacionId: e.de50000, cantidad }] }],
      }),
    );

    expect(respuesta.statusCode).toBe(400);
  });

  it('una caja sin cuenta de efectivo, o desactivada, no abre', async () => {
    const e = await escenario();
    const sinCuenta = await prisma.caja.create({
      data: { nombre: `Caja ${unico()}`, sucursalId: e.sucursalId },
    });
    const apagada = await prisma.caja.create({
      data: { nombre: `Caja ${unico()}`, sucursalId: e.sucursalId, activa: false },
    });

    const a = await abrir(e, cuerpoApertura(e, { cajaId: sinCuenta.id }));
    const b = await abrir(e, cuerpoApertura(e, { cajaId: apagada.id }));
    const c = await abrir(e, cuerpoApertura(e, { cajaId: randomUUID() }));

    for (const respuesta of [a, b, c]) {
      expect(respuesta.statusCode).toBe(409);
      expect(cuerpoError(respuesta).codigo).toBe('ESTADO_INVALIDO');
    }
  });

  it('con la jornada del día cerrada, nadie abre turno hasta que se reabra', async () => {
    const e = await escenario();
    const fecha = new Date(`${fechaEnZona(new Date(), 'America/Bogota')}T00:00:00Z`);
    await prisma.jornada.create({ data: { sucursalId: e.sucursalId, fecha, estado: 'cerrada' } });

    const respuesta = await abrir(e, cuerpoApertura(e));

    expect(respuesta.statusCode).toBe(409);
    expect(cuerpoError(respuesta).mensaje).toContain('jornada de hoy ya está cerrada');
  });
});

describe('un turno abierto por caja y por persona', () => {
  it('otra persona no abre en una caja que ya está en uso', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await llamar(api, 'POST', '/turnos', { token: e.vendedor.token, cuerpo: cuerpoApertura(e) });

    const respuesta = await llamar(api, 'POST', '/turnos', {
      token: e.admin.token,
      cuerpo: cuerpoApertura(e),
    });

    expect(respuesta.statusCode).toBe(409);
    expect(cuerpoError(respuesta).mensaje).toContain('ya tiene un turno abierto');
  });

  it('la misma persona no abre un segundo turno en otra caja', async () => {
    const e = await escenario();
    const otraCaja = await prisma.caja.create({
      data: { nombre: `Caja ${unico()}`, sucursalId: e.sucursalId },
    });
    await prisma.cuentaDinero.create({
      data: {
        nombre: `Efectivo ${unico()}`,
        tipo: 'caja',
        moneda: 'COP',
        sucursalId: e.sucursalId,
        cajaId: otraCaja.id,
      },
    });
    const api = nuevaApp();
    await llamar(api, 'POST', '/turnos', { token: e.vendedor.token, cuerpo: cuerpoApertura(e) });

    const respuesta = await llamar(api, 'POST', '/turnos', {
      token: e.vendedor.token,
      cuerpo: cuerpoApertura(e, { cajaId: otraCaja.id }),
    });

    expect(respuesta.statusCode).toBe(409);
    expect(cuerpoError(respuesta).mensaje).toContain('Ya tienes un turno abierto');
  });

  it('dos aperturas simultáneas en la misma caja: una gana y la otra recibe el error', async () => {
    const e = await escenario();
    const api = nuevaApp();

    const [a, b] = await Promise.all([
      llamar(api, 'POST', '/turnos', { token: e.vendedor.token, cuerpo: cuerpoApertura(e) }),
      llamar(api, 'POST', '/turnos', { token: e.admin.token, cuerpo: cuerpoApertura(e) }),
    ]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    expect(await prisma.turno.count({ where: { cajaId: e.cajaId, estado: 'abierto' } })).toBe(1);
  });

  it('las opciones muestran quién tiene ocupada cada caja', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await llamar(api, 'POST', '/turnos', { token: e.vendedor.token, cuerpo: cuerpoApertura(e) });

    const respuesta = await llamar(api, 'GET', '/turnos/opciones', { token: e.admin.token });

    const { cajas, miTurno } = respuesta.json<{
      cajas: {
        id: string;
        ocupadaPor: string | null;
        monedas: { moneda: string; denominaciones: { valor: string }[] }[];
      }[];
      miTurno: unknown;
    }>();
    const caja = cajas.find((c) => c.id === e.cajaId);
    expect(caja?.ocupadaPor).toBe('Usuario de prueba');
    expect(caja?.monedas.map((m) => m.moneda)).toEqual(['COP']);
    expect(caja?.monedas[0]?.denominaciones.map((d) => d.valor)).toEqual(
      expect.arrayContaining(['50001.000', '20001.000']),
    );
    expect(miTurno).toBeNull();
  });
});

describe('consultar turnos', () => {
  it('cada quien ve los suyos; el administrador ve todos y puede listar', async () => {
    const e = await escenario();
    const otro = await sesion('vendedor');
    const api = nuevaApp();
    const turno = turnoDe(
      await llamar(api, 'POST', '/turnos', { token: e.vendedor.token, cuerpo: cuerpoApertura(e) }),
    );

    const propio = await llamar(api, 'GET', `/turnos/${turno.id}`, { token: e.vendedor.token });
    const ajeno = await llamar(api, 'GET', `/turnos/${turno.id}`, { token: otro.token });
    const admin = await llamar(api, 'GET', `/turnos/${turno.id}`, { token: e.admin.token });
    const lista = await llamar(api, 'GET', `/turnos?estado=abierto&cajaId=${e.cajaId}`, {
      token: e.admin.token,
    });

    expect(propio.statusCode).toBe(200);
    expect(ajeno.statusCode).toBe(404);
    expect(admin.statusCode).toBe(200);
    expect(lista.json<{ turnos: { id: string }[] }>().turnos.map((t) => t.id)).toEqual([turno.id]);
  });

  it('sin turno abierto, "actual" responde nulo', async () => {
    const { token } = await sesion('vendedor');

    const respuesta = await llamar(nuevaApp(), 'GET', '/turnos/actual', { token });

    expect(respuesta.json()).toEqual({ turno: null });
  });
});

describe('la cuenta de efectivo de una caja', () => {
  const crearCuenta = (e: Escenario, cuerpo: Record<string, unknown>) =>
    llamar(nuevaApp(), 'POST', '/cuentas-dinero', {
      token: e.admin.token,
      cuerpo: {
        nombre: `Efectivo ${unico()}`,
        tipo: 'caja',
        moneda: 'USD',
        sucursalId: e.sucursalId,
        ...cuerpo,
      },
    });

  it('se asigna a una caja de su sucursal, y sin caja es la bóveda', async () => {
    const e = await escenario();

    const enCaja = await crearCuenta(e, { cajaId: e.cajaId });
    const boveda = await crearCuenta(e, {});

    expect(enCaja.statusCode).toBe(201);
    expect(enCaja.json<{ cuenta: { cajaId: string | null } }>().cuenta.cajaId).toBe(e.cajaId);
    expect(boveda.statusCode).toBe(201);
    expect(
      boveda.json<{ cuenta: { cajaId: string | null; cajaNombre: string | null } }>().cuenta,
    ).toMatchObject({
      cajaId: null,
      cajaNombre: null,
    });
  });

  it('no puede ser de una caja de otra sucursal, ni repetir moneda en la misma caja', async () => {
    const e = await escenario();
    const otraSucursal = await prisma.sucursal.create({
      data: { nombre: `Sucursal ${unico()}`, ciudad: 'Cúcuta' },
    });
    const cajaAjena = await prisma.caja.create({
      data: { nombre: `Caja ${unico()}`, sucursalId: otraSucursal.id },
    });

    const deOtraSucursal = await crearCuenta(e, { cajaId: cajaAjena.id });
    const monedaRepetida = await crearCuenta(e, { moneda: 'COP', cajaId: e.cajaId });

    expect(deOtraSucursal.statusCode).toBe(400);
    expect(monedaRepetida.statusCode).toBe(400);
    expect(JSON.stringify(cuerpoError(monedaRepetida).detalles)).toContain('ya tiene una cuenta');
  });

  it('una cuenta bancaria no pertenece a una caja', async () => {
    const e = await escenario();
    const banco = await prisma.banco.upsert({
      where: { codigo: '9400' },
      update: {},
      create: { codigo: '9400', nombre: 'Banco de prueba de turnos' },
    });

    const respuesta = await crearCuenta(e, {
      tipo: 'banco',
      bancoId: banco.id,
      ultimos4Digitos: '1234',
      cajaId: e.cajaId,
    });

    expect(respuesta.statusCode).toBe(400);
  });

  it('no se mueve a otra caja mientras haya un turno abierto en ella', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await llamar(api, 'POST', '/turnos', { token: e.vendedor.token, cuerpo: cuerpoApertura(e) });

    const respuesta = await llamar(api, 'PATCH', `/cuentas-dinero/${e.cuentaId}`, {
      token: e.admin.token,
      cuerpo: { cajaId: null },
    });

    expect(respuesta.statusCode).toBe(400);
    expect(JSON.stringify(cuerpoError(respuesta).detalles)).toContain('turno abierto');
  });
});

describe('fecha del local', () => {
  it('usa la zona indicada, no la del servidor', () => {
    const instante = new Date('2026-10-14T03:30:00Z');

    expect(fechaEnZona(instante, 'America/Bogota')).toBe('2026-10-13');
    expect(fechaEnZona(instante, 'UTC')).toBe('2026-10-14');
    expect(fechaEnZona(instante, 'America/Caracas')).toBe('2026-10-13');
  });
});

describe('cerrar un turno con arqueo (D127)', () => {
  /** Abre el turno del vendedor con 2 × 50.001 + 3 × 20.001 = 160.005 en caja. */
  async function abierto(e: Escenario, api: FastifyInstance) {
    const respuesta = await llamar(api, 'POST', '/turnos', {
      token: e.vendedor.token,
      cuerpo: cuerpoApertura(e),
    });
    expect(respuesta.statusCode).toBe(201);
    return turnoDe(respuesta).id;
  }

  const cerrar = (
    api: FastifyInstance,
    token: string,
    id: string,
    cuerpo: Record<string, unknown>,
  ) => llamar(api, 'POST', `/turnos/${id}/cerrar`, { token, cuerpo });

  /** Anota en el libro un movimiento de la caja durante el turno (como lo harían una venta o un gasto). */
  async function mover(e: Escenario, sentido: 'entrada' | 'salida', monto: string) {
    await prisma.$transaction((tx) =>
      registrarMovimiento(tx, {
        cuentaId: e.cuentaId,
        sentido,
        monto,
        moneda: 'COP',
        origen: sentido === 'entrada' ? 'remesa_ingreso' : 'gasto',
        usuarioId: e.vendedor.id,
      }),
    );
  }

  const cierreDe = (turno: TurnoJson) =>
    turno.saldos.find((saldo) => saldo.momento === 'cierre' && saldo.moneda === 'COP');

  it('si el efectivo cuadra: diferencia cero, turno cerrado y la caja queda libre', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const id = await abierto(e, api);

    const respuesta = await cerrar(api, e.vendedor.token, id, { conteos: [conteoCop(e, 2, 3)] });

    expect(respuesta.statusCode).toBe(200);
    const turno = turnoDe(respuesta);
    expect(turno).toMatchObject({
      estado: 'cerrado',
      cerradoPor: { id: e.vendedor.id },
      motivoCierre: null,
    });
    expect(cierreDe(turno)).toMatchObject({
      esperado: '160005.00',
      contado: '160005.00',
      diferencia: '0.00',
      explicacion: null,
      resultado: 'cuadrado',
    });
    expect(turno.conteos.filter((c) => c.momento === 'cierre')).toHaveLength(2);
    const fila = await prisma.turno.findUniqueOrThrow({ where: { id } });
    expect(fila).toMatchObject({ cajaEnUso: null, usuarioEnUso: null });
    // La misma persona y la misma caja pueden abrir otro turno.
    const otro = await llamar(api, 'POST', '/turnos', {
      token: e.vendedor.token,
      cuerpo: cuerpoApertura(e),
    });
    expect(otro.statusCode).toBe(201);
  });

  it('lo esperado suma lo que entró y resta lo que salió de la caja durante el turno', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const id = await abierto(e, api);
    await mover(e, 'entrada', '50001'); // una venta en efectivo
    await mover(e, 'salida', '20001'); // un gasto

    // 160.005 + 50.001 − 20.001 = 190.005 = 3 × 50.001 + 2 × 20.001
    const respuesta = await cerrar(api, e.vendedor.token, id, { conteos: [conteoCop(e, 3, 2)] });

    expect(respuesta.statusCode, respuesta.body).toBe(200);
    expect(cierreDe(turnoDe(respuesta))).toMatchObject({
      esperado: '190005.00',
      contado: '190005.00',
      diferencia: '0.00',
      resultado: 'cuadrado',
    });
  });

  it('un faltante exige explicación y queda atribuido a ese turno', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const id = await abierto(e, api);

    const sinExplicar = await cerrar(api, e.vendedor.token, id, { conteos: [conteoCop(e, 2, 2)] });
    expect(sinExplicar.statusCode).toBe(400);
    expect((await prisma.turno.findUniqueOrThrow({ where: { id } })).estado).toBe('abierto');
    expect(await prisma.saldoTurno.count({ where: { turnoId: id, momento: 'cierre' } })).toBe(0);

    const explicado = await cerrar(api, e.vendedor.token, id, {
      conteos: [conteoCop(e, 2, 2)],
      explicaciones: [{ moneda: 'COP', texto: 'Billete de 20.001 que se dio de vueltos' }],
    });

    expect(explicado.statusCode).toBe(200);
    expect(cierreDe(turnoDe(explicado))).toMatchObject({
      esperado: '160005.00',
      contado: '140004.00',
      diferencia: '-20001.00',
      explicacion: 'Billete de 20.001 que se dio de vueltos',
      resultado: 'faltante',
    });
  });

  it('un sobrante también, y sin tolerancia: un solo billete de diferencia ya cuenta', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const id = await abierto(e, api);

    const respuesta = await cerrar(api, e.vendedor.token, id, {
      conteos: [conteoCop(e, 2, 4)],
      explicaciones: [{ moneda: 'COP', texto: 'Un cliente dejó de más' }],
    });

    expect(cierreDe(turnoDe(respuesta))).toMatchObject({
      diferencia: '20001.00',
      resultado: 'sobrante',
    });
  });

  it('una explicación de más no se guarda si el efectivo cuadra', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const id = await abierto(e, api);

    const respuesta = await cerrar(api, e.vendedor.token, id, {
      conteos: [conteoCop(e, 2, 3)],
      explicaciones: [{ moneda: 'COP', texto: 'No hacía falta' }],
    });

    expect(cierreDe(turnoDe(respuesta))?.explicacion).toBeNull();
  });

  it('el siguiente turno de esa caja espera como apertura lo que se contó al cerrar', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const id = await abierto(e, api);
    await cerrar(api, e.vendedor.token, id, {
      conteos: [conteoCop(e, 2, 2)],
      explicaciones: [{ moneda: 'COP', texto: 'Faltó un billete' }],
    });

    const siguiente = await llamar(api, 'POST', '/turnos', {
      token: e.vendedor.token,
      cuerpo: cuerpoApertura(e, { conteos: [conteoCop(e, 2, 2)] }),
    });

    expect(turnoDe(siguiente).saldos[0]).toMatchObject({
      momento: 'apertura',
      esperado: '140004.00',
      contado: '140004.00',
      diferencia: '0.00',
    });
  });

  describe('quién puede cerrar', () => {
    it('el vendedor no cierra el turno de otra persona', async () => {
      const e = await escenario();
      const api = nuevaApp();
      const id = await abierto(e, api);
      const otro = await sesion('vendedor');

      const respuesta = await cerrar(api, otro.token, id, { conteos: [conteoCop(e, 2, 3)] });

      expect(respuesta.statusCode).toBe(403);
      expect((await prisma.turno.findUniqueOrThrow({ where: { id } })).estado).toBe('abierto');
    });

    it('el administrador cierra un turno olvidado, con motivo; la diferencia sigue siendo del vendedor', async () => {
      const e = await escenario();
      const api = nuevaApp();
      const id = await abierto(e, api);
      const cuerpoCierre = {
        conteos: [conteoCop(e, 2, 2)],
        explicaciones: [{ moneda: 'COP', texto: 'Se contó al día siguiente' }],
      };

      const sinMotivo = await cerrar(api, e.admin.token, id, cuerpoCierre);
      const conMotivo = await cerrar(api, e.admin.token, id, {
        ...cuerpoCierre,
        motivo: 'El vendedor se fue sin cerrar el turno',
      });

      expect(sinMotivo.statusCode).toBe(400);
      expect(conMotivo.statusCode).toBe(200);
      expect(turnoDe(conMotivo)).toMatchObject({
        usuario: { id: e.vendedor.id },
        cerradoPor: { id: e.admin.id },
        motivoCierre: 'El vendedor se fue sin cerrar el turno',
      });
      expect(cierreDe(turnoDe(conMotivo))?.resultado).toBe('faltante');
    });

    it('el digitador y quien no tiene sesión no cierran nada', async () => {
      const e = await escenario();
      const api = nuevaApp();
      const id = await abierto(e, api);
      const digitador = await sesion('digitador');

      const sinSesion = await llamar(api, 'POST', `/turnos/${id}/cerrar`, {
        cuerpo: { conteos: [conteoCop(e, 2, 3)] },
      });
      const sinPermiso = await cerrar(api, digitador.token, id, { conteos: [conteoCop(e, 2, 3)] });

      expect(sinSesion.statusCode).toBe(401);
      expect(sinPermiso.statusCode).toBe(403);
    });
  });

  describe('qué se rechaza', () => {
    it('un turno ya cerrado, uno que no existe, y dos cierres a la vez', async () => {
      const e = await escenario();
      const api = nuevaApp();
      const id = await abierto(e, api);
      const cuerpoCierre = { conteos: [conteoCop(e, 2, 3)] };

      const [a, b] = await Promise.all([
        cerrar(api, e.vendedor.token, id, cuerpoCierre),
        cerrar(api, e.vendedor.token, id, cuerpoCierre),
      ]);
      const otra = await cerrar(api, e.vendedor.token, id, cuerpoCierre);

      expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
      expect(otra.statusCode).toBe(409);
      expect((await cerrar(api, e.vendedor.token, randomUUID(), cuerpoCierre)).statusCode).toBe(
        404,
      );
      expect(await prisma.saldoTurno.count({ where: { turnoId: id, momento: 'cierre' } })).toBe(1);
    });

    it('un conteo que no cubre la moneda de la caja, o con denominaciones inválidas', async () => {
      const e = await escenario();
      const api = nuevaApp();
      const id = await abierto(e, api);
      const probar = (conteos: unknown[]) => cerrar(api, e.vendedor.token, id, { conteos });

      const sinCop = await probar([{ moneda: 'USD', lineas: [] }]);
      const deOtraMoneda = await probar([
        { moneda: 'COP', lineas: [{ denominacionId: e.usdDe87, cantidad: 1 }] },
      ]);
      const repetida = await probar([
        {
          moneda: 'COP',
          lineas: [
            { denominacionId: e.de50000, cantidad: 1 },
            { denominacionId: e.de50000, cantidad: 2 },
          ],
        },
      ]);
      const negativa = await probar([
        { moneda: 'COP', lineas: [{ denominacionId: e.de50000, cantidad: -1 }] },
      ]);

      for (const respuesta of [sinCop, deOtraMoneda, repetida, negativa]) {
        expect(respuesta.statusCode).toBe(400);
      }
      expect((await prisma.turno.findUniqueOrThrow({ where: { id } })).estado).toBe('abierto');
    });

    it('un conteo en cero es válido y es un faltante si había efectivo', async () => {
      const e = await escenario();
      const api = nuevaApp();
      const id = await abierto(e, api);

      const respuesta = await cerrar(api, e.vendedor.token, id, {
        conteos: [conteoCop(e, 0, 0)],
        explicaciones: [{ moneda: 'COP', texto: 'Se llevaron toda la caja al banco' }],
      });

      expect(cierreDe(turnoDe(respuesta))).toMatchObject({
        contado: '0.00',
        diferencia: '-160005.00',
        resultado: 'faltante',
      });
    });
  });

  it('queda en la bitácora con lo esperado, lo contado y la explicación', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const id = await abierto(e, api);

    await cerrar(api, e.vendedor.token, id, {
      conteos: [conteoCop(e, 2, 2)],
      explicaciones: [{ moneda: 'COP', texto: 'Faltó un billete de veinte' }],
    });

    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'turno.cerrar', entidadId: id },
    });
    expect(registro.usuarioId).toBe(e.vendedor.id);
    const texto = aTexto(registro.despues);
    expect(texto).toContain('160005.00');
    expect(texto).toContain('140004.00');
    expect(texto).toContain('Faltó un billete de veinte');
  });
});
