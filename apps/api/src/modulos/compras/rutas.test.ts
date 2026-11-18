import { randomUUID } from 'node:crypto';

import {
  aDecimal,
  entrarAlInventario,
  revertirEntrada,
  type EstadoInventario,
} from '@cambios-jc/shared';
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

interface CompraJson {
  id: string;
  moneda: string;
  cantidad: string;
  tasa: string;
  montoPesos: string;
  formaPago: string;
  cuentaPago: { id: string } | null;
  anulado: { motivo: string } | null;
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
  const contraparte = await prisma.contraparte.create({
    data: { nombre: `Proveedor ${unico()}`, tipo: 'proveedor', creadoPorId: admin.id },
  });
  return {
    admin,
    vendedor,
    digitador,
    boveda: boveda.id,
    cuentaVes: cuentaVes.id,
    contraparte: contraparte.id,
  };
}

type Escenario = Awaited<ReturnType<typeof escenario>>;

const cuerpoCompra = (e: Escenario, extra: Record<string, unknown> = {}) => ({
  claveIdempotencia: randomUUID(),
  contraparteId: e.contraparte,
  cuentaDestinoId: e.cuentaVes,
  cantidad: '10000',
  tasa: '3.7',
  formaPago: 'contado',
  cuentaPagoId: e.boveda,
  ...extra,
});

const compraDe = (respuesta: { json: () => unknown }) =>
  (respuesta.json() as { compra: CompraJson }).compra;

async function inventarioVes(): Promise<EstadoInventario> {
  const fila = await prisma.inventarioDivisa.findUnique({ where: { moneda: 'VES' } });
  return {
    cantidad: aDecimal(fila?.cantidad.toString() ?? '0'),
    costoPromedio: fila?.costoPromedio ? aDecimal(fila.costoPromedio.toString()) : null,
  };
}

const ver = (e: EstadoInventario) => ({
  cantidad: e.cantidad.toFixed(3),
  costo: e.costoPromedio?.toFixed(6) ?? null,
});

async function saldoContraparte(id: string, moneda: string): Promise<string> {
  const filas = await prisma.movimientoContraparte.findMany({
    where: { contraparteId: id, moneda },
  });
  return filas
    .reduce((total, f) => total.plus(aDecimal(f.monto.toString()).times(f.signo)), aDecimal('0'))
    .toFixed(2);
}

describe('acceso', () => {
  it('compras e inventario son solo del administrador', async () => {
    const e = await escenario();
    const api = nuevaApp();
    expect((await llamar(api, 'GET', '/compras')).statusCode).toBe(401);
    for (const quien of [e.vendedor, e.digitador]) {
      for (const [metodo, url, cuerpo] of [
        ['GET', '/compras', undefined],
        ['GET', '/compras/opciones', undefined],
        ['POST', '/compras', cuerpoCompra(e)],
        ['POST', `/compras/${randomUUID()}/anular`, { motivo: 'prueba' }],
        ['GET', '/inventario', undefined],
        ['GET', '/inventario/VES/movimientos', undefined],
        ['POST', '/inventario/VES/ajustes', { sentido: 'salida', cantidad: '1', motivo: 'xyz' }],
      ] as const) {
        const respuesta = await llamar(api, metodo, url, { token: quien.token, cuerpo });
        expect(respuesta.statusCode, `${metodo} ${url}`).toBe(403);
        expect(cuerpoError(respuesta).codigo).toBe('SIN_PERMISO');
      }
    }
  });
});

describe('registrar una compra', () => {
  it('de contado: entran los bolívares, salen los pesos y el inventario promedia', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const antes = await inventarioVes();

    const respuesta = await llamar(api, 'POST', '/compras', {
      token: e.admin.token,
      cuerpo: cuerpoCompra(e, { cantidad: '43085.106', tasa: '3.76', nota: 'Fondeo de la mañana' }),
    });

    expect(respuesta.statusCode).toBe(201);
    expect(compraDe(respuesta)).toMatchObject({
      moneda: 'VES',
      cantidad: '43085.106',
      tasa: '3.760000',
      // 43085,106 × 3,76 = 161999,99856 → 162000,00 (ROUND_HALF_UP)
      montoPesos: '162000.00',
      formaPago: 'contado',
      cuentaPago: { id: e.boveda },
      anulado: null,
    });
    expect((await saldoDeCuenta(prisma, e.cuentaVes)).toFixed(3)).toBe('43085.106');
    expect((await saldoDeCuenta(prisma, e.boveda)).toFixed(2)).toBe('-162000.00');
    expect(ver(await inventarioVes())).toEqual(
      ver(entrarAlInventario(antes, '43085.106', '3.76', 'VES')),
    );
    expect(await saldoContraparte(e.contraparte, 'COP')).toBe('0.00');
  });

  it('a crédito: le debo los pesos; si había anticipo, lo descuenta (fondeo)', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const anticipo = await llamar(api, 'POST', `/contrapartes/${e.contraparte}/movimientos`, {
      token: e.admin.token,
      cuerpo: {
        claveIdempotencia: randomUUID(),
        tipo: 'anticipo_proveedor',
        moneda: 'COP',
        monto: '50000',
        cuentaId: e.boveda,
      },
    });
    expect(anticipo.statusCode).toBe(201);
    expect(await saldoContraparte(e.contraparte, 'COP')).toBe('50000.00');

    const respuesta = await llamar(api, 'POST', '/compras', {
      token: e.admin.token,
      cuerpo: cuerpoCompra(e, {
        formaPago: 'credito',
        cuentaPagoId: undefined,
        cantidad: '20000',
        tasa: '3.5',
      }),
    });
    expect(respuesta.statusCode).toBe(201);
    expect(compraDe(respuesta)).toMatchObject({ montoPesos: '70000.00', cuentaPago: null });
    // Me debía 50.000 del anticipo; la compra vale 70.000: ahora le debo 20.000.
    expect(await saldoContraparte(e.contraparte, 'COP')).toBe('-20000.00');
    expect((await saldoDeCuenta(prisma, e.boveda)).toFixed(2)).toBe('-50000.00');
    const detalle = await llamar(api, 'GET', `/contrapartes/${e.contraparte}`, {
      token: e.admin.token,
    });
    const { movimientos } = detalle.json<{
      movimientos: { tipo: string; compraId: string | null }[];
    }>();
    expect(movimientos.find((m) => m.tipo === 'compra_credito')?.compraId).toBe(
      compraDe(respuesta).id,
    );
  });

  it('rechaza lo que no cuadra', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const casos: [Record<string, unknown>, number][] = [
      [{ cuentaDestinoId: e.boveda }, 409],
      [{ cuentaPagoId: e.cuentaVes }, 409],
      [{ cantidad: '10.1234' }, 400],
      [{ tasa: '0' }, 400],
      [{ formaPago: 'contado', cuentaPagoId: undefined }, 400],
      [{ formaPago: 'credito' }, 400],
      [{ contraparteId: randomUUID() }, 409],
    ];
    for (const [extra, estado] of casos) {
      const respuesta = await llamar(api, 'POST', '/compras', {
        token: e.admin.token,
        cuerpo: cuerpoCompra(e, extra),
      });
      expect(respuesta.statusCode, JSON.stringify(extra)).toBe(estado);
    }
  });

  it('es idempotente', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const cuerpo = cuerpoCompra(e);
    const [a, b] = await Promise.all([
      llamar(api, 'POST', '/compras', { token: e.admin.token, cuerpo }),
      llamar(api, 'POST', '/compras', { token: e.admin.token, cuerpo }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect((await saldoDeCuenta(prisma, e.cuentaVes)).toFixed(3)).toBe('10000.000');
  });
});

describe('anular una compra', () => {
  it('deshace el dinero, la deuda y el inventario; no se anula dos veces', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const contado = compraDe(
      await llamar(api, 'POST', '/compras', { token: e.admin.token, cuerpo: cuerpoCompra(e) }),
    );
    const credito = compraDe(
      await llamar(api, 'POST', '/compras', {
        token: e.admin.token,
        cuerpo: cuerpoCompra(e, { formaPago: 'credito', cuentaPagoId: undefined, tasa: '3.9' }),
      }),
    );
    const antes = await inventarioVes();

    const anulada = await llamar(api, 'POST', `/compras/${credito.id}/anular`, {
      token: e.admin.token,
      cuerpo: { motivo: 'El proveedor no entregó' },
    });
    expect(anulada.statusCode).toBe(200);
    expect(compraDe(anulada).anulado).toMatchObject({ motivo: 'El proveedor no entregó' });
    expect(await saldoContraparte(e.contraparte, 'COP')).toBe('0.00');
    expect(ver(await inventarioVes())).toEqual(ver(revertirEntrada(antes, '10000', '3.9', 'VES')));

    await llamar(api, 'POST', `/compras/${contado.id}/anular`, {
      token: e.admin.token,
      cuerpo: { motivo: 'Duplicada' },
    });
    expect((await saldoDeCuenta(prisma, e.cuentaVes)).toFixed(3)).toBe('0.000');
    expect((await saldoDeCuenta(prisma, e.boveda)).toFixed(2)).toBe('0.00');

    const otraVez = await llamar(api, 'POST', `/compras/${contado.id}/anular`, {
      token: e.admin.token,
      cuerpo: { motivo: 'Otra vez' },
    });
    expect(otraVez.statusCode).toBe(409);
    // El movimiento de la compra no se anula suelto, desde la cuenta corriente.
    const deuda = await prisma.movimientoContraparte.findFirst({
      where: { tipo: 'compra_credito', contraparteId: e.contraparte, revierteId: null },
    });
    const suelto = await llamar(
      api,
      'POST',
      `/contrapartes/movimientos/${deuda?.id ?? ''}/anular`,
      {
        token: e.admin.token,
        cuerpo: { motivo: 'No debería' },
      },
    );
    expect(suelto.statusCode).toBe(409);

    const lista = await llamar(api, 'GET', '/compras', {
      token: e.admin.token,
      consulta: `contraparteId=${e.contraparte}`,
    });
    expect(lista.json<{ compras: CompraJson[] }>().compras).toHaveLength(2);
  });
});

describe('inventario', () => {
  it('muestra cantidad, costo y saldo real; el ajuste exige tasa al entrar y deja historial', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const sinTasa = await llamar(api, 'POST', '/inventario/VES/ajustes', {
      token: e.admin.token,
      cuerpo: { sentido: 'entrada', cantidad: '100', motivo: 'Inicial' },
    });
    expect(sinTasa.statusCode).toBe(400);
    const pesos = await llamar(api, 'POST', '/inventario/COP/ajustes', {
      token: e.admin.token,
      cuerpo: { sentido: 'salida', cantidad: '100', motivo: 'Inicial' },
    });
    expect(pesos.statusCode).toBe(400);

    const antes = await inventarioVes();
    const salida = await llamar(api, 'POST', '/inventario/VES/ajustes', {
      token: e.admin.token,
      cuerpo: {
        sentido: 'salida',
        cantidad: '12.5',
        motivo: 'Bolívares perdidos en una transferencia',
      },
    });
    expect(salida.statusCode).toBe(200);
    expect(salida.json<{ inventario: { cantidad: string } }>().inventario.cantidad).toBe(
      antes.cantidad.minus('12.5').toFixed(3),
    );

    const lista = await llamar(api, 'GET', '/inventario', { token: e.admin.token });
    expect(lista.statusCode).toBe(200);
    expect(
      lista.json<{ inventarios: { moneda: string }[] }>().inventarios.map((i) => i.moneda),
    ).toContain('VES');

    const historial = await llamar(api, 'GET', '/inventario/VES/movimientos', {
      token: e.admin.token,
    });
    const [ultimo] = historial.json<{
      movimientos: { origen: string; sentido: string; nota: string }[];
    }>().movimientos;
    expect(ultimo).toMatchObject({
      origen: 'ajuste',
      sentido: 'salida',
      nota: 'Bolívares perdidos en una transferencia',
    });

    const fila = await prisma.movimientoInventario.findFirstOrThrow({
      orderBy: { creadoEn: 'desc' },
    });
    await expect(prisma.movimientoInventario.delete({ where: { id: fila.id } })).rejects.toThrow();
  });
});
