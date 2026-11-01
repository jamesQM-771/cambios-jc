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
import { saldoDeCuenta } from '../../lib/libro.js';
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

const unico = () => randomUUID().slice(0, 8);

async function sesion(rol: 'administrador' | 'vendedor' | 'digitador') {
  const usuario = await crearUsuarioDePrueba(prisma, { rol });
  return { id: usuario.id, token: await abrirSesion(prisma, usuario.id) };
}

interface ContraparteJson {
  id: string;
  nombre: string;
  tipo: string;
  activa: boolean;
  saldos: { moneda: string; saldo: string }[];
  cuentasTitular: { id: string }[];
}

interface MovimientoJson {
  id: string;
  tipo: string;
  moneda: string;
  monto: string;
  signo: number;
  cuenta: { id: string } | null;
  nota: string | null;
  revierteId: string | null;
  anulacion: { id: string; motivo: string | null } | null;
}

async function escenario() {
  const [admin, vendedor, digitador] = await Promise.all([
    sesion('administrador'),
    sesion('vendedor'),
    sesion('digitador'),
  ]);
  const sucursal = await prisma.sucursal.create({
    data: { nombre: `Sucursal ${unico()}`, ciudad: 'Cúcuta' },
  });
  const cuenta = (tipo: 'caja' | 'billetera', moneda: 'COP' | 'VES') =>
    prisma.cuentaDinero.create({
      data: { nombre: `Cuenta ${unico()}`, tipo, moneda, sucursalId: sucursal.id },
    });
  const [boveda, cuentaVes] = await Promise.all([
    cuenta('caja', 'COP'),
    cuenta('billetera', 'VES'),
  ]);
  return { admin, vendedor, digitador, sucursal, boveda: boveda.id, cuentaVes: cuentaVes.id };
}

async function crearContraparte(
  api: FastifyInstance,
  token: string,
  extra: Record<string, unknown> = {},
): Promise<ContraparteJson> {
  const respuesta = await llamar(api, 'POST', '/contrapartes', {
    token,
    cuerpo: { nombre: `Proveedor ${unico()}`, tipo: 'proveedor', ...extra },
  });
  expect(respuesta.statusCode).toBe(201);
  return respuesta.json<{ contraparte: ContraparteJson }>().contraparte;
}

const movimiento = (extra: Record<string, unknown>) => ({
  claveIdempotencia: randomUUID(),
  moneda: 'COP',
  monto: '100000',
  ...extra,
});

async function registrar(
  api: FastifyInstance,
  token: string,
  contraparteId: string,
  cuerpo: Record<string, unknown>,
) {
  return llamar(api, 'POST', `/contrapartes/${contraparteId}/movimientos`, { token, cuerpo });
}

const movimientoDe = (respuesta: { json: () => unknown }) =>
  (respuesta.json() as { movimiento: MovimientoJson }).movimiento;

async function detalle(api: FastifyInstance, token: string, id: string) {
  const respuesta = await llamar(api, 'GET', `/contrapartes/${id}`, { token });
  expect(respuesta.statusCode).toBe(200);
  return respuesta.json<{ contraparte: ContraparteJson; movimientos: MovimientoJson[] }>();
}

describe('acceso', () => {
  it('exige sesión y el permiso de contrapartes (solo el administrador)', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const contraparte = await crearContraparte(api, e.admin.token);
    expect((await llamar(api, 'GET', '/contrapartes')).statusCode).toBe(401);
    for (const sesionSinPermiso of [e.vendedor, e.digitador]) {
      for (const [metodo, url, cuerpo] of [
        ['GET', '/contrapartes', undefined],
        ['GET', '/contrapartes/resumen', undefined],
        ['GET', '/contrapartes/opciones', undefined],
        ['GET', `/contrapartes/${contraparte.id}`, undefined],
        ['POST', '/contrapartes', { nombre: 'X y', tipo: 'otro' }],
        ['PATCH', `/contrapartes/${contraparte.id}`, { activa: false }],
        [
          'POST',
          `/contrapartes/${contraparte.id}/movimientos`,
          movimiento({ tipo: 'prestamo_otorgado' }),
        ],
      ] as const) {
        const respuesta = await llamar(api, metodo, url, { token: sesionSinPermiso.token, cuerpo });
        expect(respuesta.statusCode, `${metodo} ${url}`).toBe(403);
        expect(cuerpoError(respuesta).codigo).toBe('SIN_PERMISO');
      }
    }
  });
});

describe('catálogo', () => {
  it('crea, edita y desactiva; el nombre no se repite sin importar mayúsculas', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const nombre = `Sara Castro ${unico()}`;
    const creada = await crearContraparte(api, e.admin.token, {
      nombre,
      tipo: 'proveedor',
      documento: 'V-12345678',
      telefono: '+584141234567',
      notas: 'Vende bolívares',
    });
    expect(creada).toMatchObject({ nombre, tipo: 'proveedor', activa: true, saldos: [] });

    const repetida = await llamar(api, 'POST', '/contrapartes', {
      token: e.admin.token,
      cuerpo: { nombre: `  ${nombre.toUpperCase()} `, tipo: 'otro' },
    });
    expect(repetida.statusCode).toBe(409);
    expect(cuerpoError(repetida).codigo).toBe('VALOR_EN_USO');

    const editada = await llamar(api, 'PATCH', `/contrapartes/${creada.id}`, {
      token: e.admin.token,
      cuerpo: { tipo: 'socio', activa: false, documento: '' },
    });
    expect(editada.statusCode).toBe(200);
    expect(editada.json<{ contraparte: ContraparteJson }>().contraparte).toMatchObject({
      tipo: 'socio',
      activa: false,
      documento: null,
    });

    const auditoria = await prisma.auditoria.findFirst({
      where: { accion: 'contraparte.editar', entidadId: creada.id },
    });
    expect(auditoria).not.toBeNull();
  });

  it('una cuenta puede tener una contraparte titular (§5.9)', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const contraparte = await crearContraparte(api, e.admin.token);
    const respuesta = await llamar(api, 'PATCH', `/cuentas-dinero/${e.cuentaVes}`, {
      token: e.admin.token,
      cuerpo: { contraparteTitularId: contraparte.id },
    });
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toMatchObject({
      cuenta: {
        contraparteTitularId: contraparte.id,
        contraparteTitularNombre: contraparte.nombre,
      },
    });
    const { contraparte: conCuentas } = await detalle(api, e.admin.token, contraparte.id);
    expect(conCuentas.cuentasTitular.map((c) => c.id)).toEqual([e.cuentaVes]);

    const inexistente = await llamar(api, 'PATCH', `/cuentas-dinero/${e.cuentaVes}`, {
      token: e.admin.token,
      cuerpo: { contraparteTitularId: randomUUID() },
    });
    expect(inexistente.statusCode).toBe(400);
  });
});

describe('cuenta corriente', () => {
  it('préstamo que doy con dinero de la bóveda: me debe más y sale la plata', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const contraparte = await crearContraparte(api, e.admin.token, { tipo: 'familiar' });

    const respuesta = await registrar(
      api,
      e.admin.token,
      contraparte.id,
      movimiento({
        tipo: 'prestamo_otorgado',
        monto: '500000',
        cuentaId: e.boveda,
        nota: 'Para el arriendo',
      }),
    );
    expect(respuesta.statusCode).toBe(201);
    expect(movimientoDe(respuesta)).toMatchObject({
      tipo: 'prestamo_otorgado',
      monto: '500000.00',
      signo: 1,
      cuenta: { id: e.boveda },
    });
    expect((await saldoDeCuenta(prisma, e.boveda)).toFixed(2)).toBe('-500000.00');
    const { contraparte: actual } = await detalle(api, e.admin.token, contraparte.id);
    expect(actual.saldos).toEqual([{ moneda: 'COP', saldo: '500000.00' }]);

    // Abono parcial que me hace, sin pasar por una cuenta (solo reconocimiento).
    await registrar(
      api,
      e.admin.token,
      contraparte.id,
      movimiento({ tipo: 'abono_recibido', monto: '200000' }),
    );
    const { contraparte: tras } = await detalle(api, e.admin.token, contraparte.id);
    expect(tras.saldos).toEqual([{ moneda: 'COP', saldo: '300000.00' }]);
    expect((await saldoDeCuenta(prisma, e.boveda)).toFixed(2)).toBe('-500000.00');
  });

  it('saldo por moneda: puede deber en pesos y que le deba en bolívares a la vez', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const contraparte = await crearContraparte(api, e.admin.token);
    await registrar(
      api,
      e.admin.token,
      contraparte.id,
      movimiento({ tipo: 'anticipo_proveedor', cuentaId: e.boveda }),
    );
    const recibido = await registrar(
      api,
      e.admin.token,
      contraparte.id,
      movimiento({
        tipo: 'prestamo_recibido',
        moneda: 'VES',
        monto: '1500.125',
        cuentaId: e.cuentaVes,
      }),
    );
    expect(recibido.statusCode).toBe(201);
    expect((await saldoDeCuenta(prisma, e.cuentaVes)).toFixed(3)).toBe('1500.125');
    const { contraparte: actual } = await detalle(api, e.admin.token, contraparte.id);
    expect(actual.saldos).toEqual([
      { moneda: 'COP', saldo: '100000.00' },
      { moneda: 'VES', saldo: '-1500.125' },
    ]);

    const meDeben = await llamar(api, 'GET', '/contrapartes', {
      token: e.admin.token,
      consulta: 'saldo=me_deben',
    });
    const lesDebo = await llamar(api, 'GET', '/contrapartes', {
      token: e.admin.token,
      consulta: 'saldo=les_debo',
    });
    const ids = (r: typeof meDeben) =>
      r.json<{ contrapartes: ContraparteJson[] }>().contrapartes.map((c) => c.id);
    expect(ids(meDeben)).toContain(contraparte.id);
    expect(ids(lesDebo)).toContain(contraparte.id);

    const resumen = await llamar(api, 'GET', '/contrapartes/resumen', { token: e.admin.token });
    expect(resumen.statusCode).toBe(200);
    const filas = resumen.json<{
      resumen: { moneda: string; meDeben: string; lesDebo: string }[];
    }>().resumen;
    expect(filas.map((f) => f.moneda)).toEqual(expect.arrayContaining(['COP', 'VES']));
  });

  it('ajuste y "otro" exigen nota y dirección; el ajuste no mueve dinero', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const contraparte = await crearContraparte(api, e.admin.token);
    const sinSigno = await registrar(
      api,
      e.admin.token,
      contraparte.id,
      movimiento({ tipo: 'ajuste', nota: 'Error de digitación' }),
    );
    expect(sinSigno.statusCode).toBe(409);
    const sinNota = await registrar(
      api,
      e.admin.token,
      contraparte.id,
      movimiento({ tipo: 'ajuste', signo: -1 }),
    );
    expect(sinNota.statusCode).toBe(409);
    const conCuenta = await registrar(
      api,
      e.admin.token,
      contraparte.id,
      movimiento({ tipo: 'ajuste', signo: -1, nota: 'x y z', cuentaId: e.boveda }),
    );
    expect(conCuenta.statusCode).toBe(409);
    const bien = await registrar(
      api,
      e.admin.token,
      contraparte.id,
      movimiento({ tipo: 'ajuste', signo: -1, nota: 'Saldo inicial del Excel' }),
    );
    expect(bien.statusCode).toBe(201);
    expect(movimientoDe(bien).signo).toBe(-1);
    const otro = await registrar(
      api,
      e.admin.token,
      contraparte.id,
      movimiento({ tipo: 'otro', signo: 1 }),
    );
    expect(otro.statusCode).toBe(409);
  });

  it('rechaza lo que no cuadra: compra a crédito suelta, signo contrario, moneda distinta, decimales, anticipo sin cuenta, contraparte inactiva', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const contraparte = await crearContraparte(api, e.admin.token);
    const casos: Record<string, unknown>[] = [
      { tipo: 'compra_credito' },
      { tipo: 'prestamo_otorgado', signo: -1 },
      { tipo: 'prestamo_otorgado', moneda: 'VES', cuentaId: e.boveda },
      { tipo: 'prestamo_otorgado', monto: '10.555' },
      { tipo: 'anticipo_proveedor' },
    ];
    for (const caso of casos) {
      const respuesta = await registrar(api, e.admin.token, contraparte.id, movimiento(caso));
      expect(respuesta.statusCode, JSON.stringify(caso)).toBe(409);
    }
    const cero = await registrar(
      api,
      e.admin.token,
      contraparte.id,
      movimiento({ tipo: 'prestamo_otorgado', monto: '0' }),
    );
    expect(cero.statusCode).toBe(400);
    await llamar(api, 'PATCH', `/contrapartes/${contraparte.id}`, {
      token: e.admin.token,
      cuerpo: { activa: false },
    });
    const inactiva = await registrar(
      api,
      e.admin.token,
      contraparte.id,
      movimiento({ tipo: 'prestamo_otorgado' }),
    );
    expect(inactiva.statusCode).toBe(409);
  });

  it('es idempotente: la misma clave devuelve el mismo movimiento', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const contraparte = await crearContraparte(api, e.admin.token);
    const cuerpo = movimiento({ tipo: 'prestamo_otorgado', cuentaId: e.boveda });
    const [a, b] = await Promise.all([
      registrar(api, e.admin.token, contraparte.id, cuerpo),
      registrar(api, e.admin.token, contraparte.id, cuerpo),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(movimientoDe(a).id).toBe(movimientoDe(b).id);
    expect((await saldoDeCuenta(prisma, e.boveda)).toFixed(2)).toBe('-100000.00');
  });

  it('anular agrega el movimiento contrario y devuelve el dinero; no se anula dos veces', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const contraparte = await crearContraparte(api, e.admin.token);
    const original = movimientoDe(
      await registrar(
        api,
        e.admin.token,
        contraparte.id,
        movimiento({
          tipo: 'prestamo_otorgado',
          cuentaId: e.boveda,
        }),
      ),
    );

    const anulado = await llamar(api, 'POST', `/contrapartes/movimientos/${original.id}/anular`, {
      token: e.admin.token,
      cuerpo: { motivo: 'Se registró dos veces' },
    });
    expect(anulado.statusCode).toBe(200);
    expect(movimientoDe(anulado).anulacion).toMatchObject({ motivo: 'Se registró dos veces' });
    expect((await saldoDeCuenta(prisma, e.boveda)).toFixed(2)).toBe('0.00');
    const { contraparte: actual, movimientos } = await detalle(api, e.admin.token, contraparte.id);
    expect(actual.saldos).toEqual([]);
    expect(movimientos).toHaveLength(2);
    const reversion = movimientos.find((m) => m.revierteId === original.id);
    expect(reversion).toMatchObject({ signo: -1, cuenta: { id: e.boveda } });

    const otraVez = await llamar(api, 'POST', `/contrapartes/movimientos/${original.id}/anular`, {
      token: e.admin.token,
      cuerpo: { motivo: 'De nuevo' },
    });
    expect(otraVez.statusCode).toBe(409);
    const laAnulacion = await llamar(
      api,
      'POST',
      `/contrapartes/movimientos/${reversion?.id ?? ''}/anular`,
      {
        token: e.admin.token,
        cuerpo: { motivo: 'De nuevo' },
      },
    );
    expect(laAnulacion.statusCode).toBe(409);
  });

  it('la base no deja modificar ni borrar la cuenta corriente', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const contraparte = await crearContraparte(api, e.admin.token);
    const creado = movimientoDe(
      await registrar(
        api,
        e.admin.token,
        contraparte.id,
        movimiento({ tipo: 'prestamo_otorgado' }),
      ),
    );
    await expect(
      prisma.movimientoContraparte.update({ where: { id: creado.id }, data: { nota: 'cambiada' } }),
    ).rejects.toThrow();
    await expect(
      prisma.movimientoContraparte.delete({ where: { id: creado.id } }),
    ).rejects.toThrow();
  });
});
