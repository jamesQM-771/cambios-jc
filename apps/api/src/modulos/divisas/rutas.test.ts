import { randomUUID } from 'node:crypto';

import {
  aDecimal,
  entrarAlInventario,
  gananciaDeVentaDivisa,
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
import { abrirTurnoDePrueba } from '../../../test/turnos.js';
import { saldoDeCuenta } from '../../lib/libro.js';
import { crearPrisma, type PrismaClient } from '../../lib/prisma.js';

let prisma: PrismaClient;
let app: FastifyInstance | undefined;
let billete100: string;
let billete20: string;

beforeAll(async () => {
  prisma = crearPrisma();
  await asegurarEmpresa(prisma);
  const asegurar = async (valor: string) => {
    const existente = await prisma.denominacion.findFirst({
      where: { moneda: 'USD', valor, activa: true },
    });
    return (existente ?? (await prisma.denominacion.create({ data: { moneda: 'USD', valor } }))).id;
  };
  billete100 = await asegurar('100');
  billete20 = await asegurar('20');
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

interface DivisaJson {
  id: string;
  numeroComprobante: number;
  tipo: string;
  montoDivisa: string;
  montoPesos: string;
  tasaUsada: string;
  motivoTasa: string | null;
  billetes: { sentido: string; valor: string; cantidad: number }[];
  ganancia: { costoPromedio: string; ganancia: string } | null;
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
  const caja = await prisma.caja.create({
    data: { nombre: `Caja ${unico()}`, sucursalId: sucursal.id },
  });
  const cuenta = (moneda: 'COP' | 'USD') =>
    prisma.cuentaDinero.create({
      data: {
        nombre: `Efectivo ${moneda} ${unico()}`,
        tipo: 'caja',
        moneda,
        sucursalId: sucursal.id,
        cajaId: caja.id,
      },
    });
  const [pesos, dolares] = await Promise.all([cuenta('COP'), cuenta('USD')]);
  await abrirTurnoDePrueba(prisma, { usuarioId: vendedor.id, cuentaCajaId: pesos.id });
  const linea = await prisma.lineaNegocio.create({
    data: {
      nombre: `Dólares ${unico()}`,
      clase: 'divisa_caja',
      monedaOrigen: 'USD',
      monedaDestino: 'COP',
    },
  });
  await prisma.tasa.create({
    data: {
      lineaNegocioId: linea.id,
      tasaCompra: '3950.000000',
      tasaVenta: '4100.000000',
      publicadaPorId: admin.id,
    },
  });
  return {
    admin,
    vendedor,
    digitador,
    pesos: pesos.id,
    dolares: dolares.id,
    linea: linea.id,
    sucursal: sucursal.id,
  };
}

type Escenario = Awaited<ReturnType<typeof escenario>>;

const cuerpo = (e: Escenario, extra: Record<string, unknown> = {}) => ({
  claveIdempotencia: randomUUID(),
  tipo: 'compra',
  lineaNegocioId: e.linea,
  montoDivisa: '260',
  billetes: [
    { denominacionId: billete100, cantidad: 2 },
    { denominacionId: billete20, cantidad: 3 },
  ],
  ...extra,
});

const operacionDe = (respuesta: { json: () => unknown }) =>
  (respuesta.json() as { operacion: DivisaJson }).operacion;

async function inventarioUsd(): Promise<EstadoInventario> {
  const fila = await prisma.inventarioDivisa.findUnique({ where: { moneda: 'USD' } });
  return {
    cantidad: aDecimal(fila?.cantidad.toString() ?? '0'),
    costoPromedio: fila?.costoPromedio ? aDecimal(fila.costoPromedio.toString()) : null,
  };
}

describe('acceso', () => {
  it('el digitador no opera divisas; anular es solo del administrador', async () => {
    const e = await escenario();
    const api = nuevaApp();
    expect((await llamar(api, 'GET', '/divisas')).statusCode).toBe(401);
    for (const [metodo, url, datos] of [
      ['GET', '/divisas', undefined],
      ['GET', '/divisas/opciones', undefined],
      ['POST', '/divisas', cuerpo(e)],
    ] as const) {
      const respuesta = await llamar(api, metodo, url, { token: e.digitador.token, cuerpo: datos });
      expect(respuesta.statusCode, `${metodo} ${url}`).toBe(403);
      expect(cuerpoError(respuesta).codigo).toBe('SIN_PERMISO');
    }
    const compra = operacionDe(
      await llamar(api, 'POST', '/divisas', { token: e.vendedor.token, cuerpo: cuerpo(e) }),
    );
    const anular = await llamar(api, 'POST', `/divisas/${compra.id}/anular`, {
      token: e.vendedor.token,
      cuerpo: { motivo: 'No puedo' },
    });
    expect(anular.statusCode).toBe(403);
  });
});

describe('comprar y vender', () => {
  it('compra: entran los dólares y salen los pesos de la caja del turno, con sus billetes', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const antes = await inventarioUsd();

    const respuesta = await llamar(api, 'POST', '/divisas', {
      token: e.vendedor.token,
      cuerpo: cuerpo(e),
    });

    expect(respuesta.statusCode).toBe(201);
    const compra = operacionDe(respuesta);
    expect(compra).toMatchObject({
      tipo: 'compra',
      montoDivisa: '260.00',
      montoPesos: '1027000.00',
      tasaUsada: '3950.000000',
      ganancia: null,
    });
    expect(compra.billetes).toEqual([
      { sentido: 'entrada', moneda: 'USD', valor: '100.00', cantidad: 2 },
      { sentido: 'entrada', moneda: 'USD', valor: '20.00', cantidad: 3 },
    ]);
    expect((await saldoDeCuenta(prisma, e.dolares)).toFixed(2)).toBe('260.00');
    expect((await saldoDeCuenta(prisma, e.pesos)).toFixed(2)).toBe('-1027000.00');
    const despues = await inventarioUsd();
    const esperado = entrarAlInventario(antes, '260', '3950', 'USD');
    expect(despues.costoPromedio?.toFixed(6)).toBe(esperado.costoPromedio?.toFixed(6));
  });

  it('venta: sale al costo promedio y el administrador ve la ganancia; el vendedor no', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await llamar(api, 'POST', '/divisas', { token: e.vendedor.token, cuerpo: cuerpo(e) });
    const costo = (await inventarioUsd()).costoPromedio?.toString() ?? '';

    const venta = operacionDe(
      await llamar(api, 'POST', '/divisas', {
        token: e.vendedor.token,
        cuerpo: cuerpo(e, {
          tipo: 'venta',
          montoDivisa: '100',
          billetes: [{ denominacionId: billete100, cantidad: 1 }],
        }),
      }),
    );
    expect(venta).toMatchObject({ tipo: 'venta', montoPesos: '410000.00', ganancia: null });
    expect(venta.billetes[0]?.sentido).toBe('salida');
    expect((await saldoDeCuenta(prisma, e.dolares)).toFixed(2)).toBe('160.00');

    const comoAdmin = await llamar(api, 'GET', `/divisas/${venta.id}`, { token: e.admin.token });
    expect(operacionDe(comoAdmin).ganancia).toEqual({
      costoPromedio: aDecimal(costo).toFixed(6),
      ganancia: gananciaDeVentaDivisa({
        montoDivisa: '100',
        tasaUsada: '4100',
        costoPromedio: costo,
      }).toFixed(2),
    });
  });

  it('rechaza billetes que no suman, repetidos o de otra moneda, y exige turno y cuentas de la caja', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const pesosBillete = await prisma.denominacion.create({
      data: { moneda: 'COP', valor: '50000' },
    });
    for (const billetes of [
      [{ denominacionId: billete100, cantidad: 2 }],
      [
        { denominacionId: billete100, cantidad: 1 },
        { denominacionId: billete100, cantidad: 1 },
      ],
      [{ denominacionId: pesosBillete.id, cantidad: 1 }],
    ]) {
      const respuesta = await llamar(api, 'POST', '/divisas', {
        token: e.vendedor.token,
        cuerpo: cuerpo(e, { billetes }),
      });
      expect(respuesta.statusCode, JSON.stringify(billetes)).toBe(409);
    }
    const sinTurno = await llamar(api, 'POST', '/divisas', {
      token: e.admin.token,
      cuerpo: cuerpo(e),
    });
    expect(sinTurno.statusCode).toBe(409);
    expect(cuerpoError(sinTurno).mensaje).toMatch(/turno/);
  });

  it('la tasa manual exige permiso; con permiso queda el motivo', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const manual = { tasa: '3980', motivo: 'Cliente frecuente' };
    const vendedor = await llamar(api, 'POST', '/divisas', {
      token: e.vendedor.token,
      cuerpo: cuerpo(e, { tasaManual: manual }),
    });
    expect(vendedor.statusCode).toBe(403);

    const otraCaja = await prisma.cuentaDinero.create({
      data: { nombre: `Admin USD ${unico()}`, tipo: 'caja', moneda: 'COP', sucursalId: e.sucursal },
    });
    const { cajaId } = await abrirTurnoDePrueba(prisma, {
      usuarioId: e.admin.id,
      cuentaCajaId: otraCaja.id,
    });
    await prisma.cuentaDinero.create({
      data: {
        nombre: `Admin USD2 ${unico()}`,
        tipo: 'caja',
        moneda: 'USD',
        sucursalId: e.sucursal,
        cajaId,
      },
    });
    const admin = await llamar(api, 'POST', '/divisas', {
      token: e.admin.token,
      cuerpo: cuerpo(e, { tasaManual: manual }),
    });
    expect(admin.statusCode).toBe(201);
    expect(operacionDe(admin)).toMatchObject({
      tasaUsada: '3980.000000',
      motivoTasa: 'Cliente frecuente',
      montoPesos: '1034800.00',
    });
  });

  it('es idempotente y el comprobante sigue el consecutivo de las remesas', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const datos = cuerpo(e);
    const [a, b] = await Promise.all([
      llamar(api, 'POST', '/divisas', { token: e.vendedor.token, cuerpo: datos }),
      llamar(api, 'POST', '/divisas', { token: e.vendedor.token, cuerpo: datos }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    const contador = await prisma.contador.findUniqueOrThrow({ where: { clave: 'comprobante' } });
    expect(operacionDe(a).numeroComprobante).toBe(contador.valor);
  });
});

describe('anular, listar e imprimir', () => {
  it('anular devuelve el dinero por las mismas cuentas; el recibo sale original y luego COPIA', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const compra = operacionDe(
      await llamar(api, 'POST', '/divisas', { token: e.vendedor.token, cuerpo: cuerpo(e) }),
    );

    const primera = await llamar(api, 'POST', `/divisas/${compra.id}/imprimir`, {
      token: e.vendedor.token,
    });
    const segunda = await llamar(api, 'POST', `/divisas/${compra.id}/imprimir`, {
      token: e.vendedor.token,
    });
    expect(primera.json()).toMatchObject({ recibo: { esCopia: false } });
    expect(segunda.json()).toMatchObject({ recibo: { esCopia: true } });

    const anulada = await llamar(api, 'POST', `/divisas/${compra.id}/anular`, {
      token: e.admin.token,
      cuerpo: { motivo: 'Billete falso' },
    });
    expect(anulada.statusCode).toBe(200);
    expect(operacionDe(anulada).anulado).toMatchObject({ motivo: 'Billete falso' });
    expect((await saldoDeCuenta(prisma, e.dolares)).toFixed(2)).toBe('0.00');
    expect((await saldoDeCuenta(prisma, e.pesos)).toFixed(2)).toBe('0.00');
    const otraVez = await llamar(api, 'POST', `/divisas/${compra.id}/anular`, {
      token: e.admin.token,
      cuerpo: { motivo: 'Otra vez' },
    });
    expect(otraVez.statusCode).toBe(409);

    // El vendedor solo ve las suyas; el administrador, todas.
    const otro = await sesion('vendedor');
    const ajena = await llamar(api, 'GET', `/divisas/${compra.id}`, { token: otro.token });
    expect(ajena.statusCode).toBe(404);
    const lista = await llamar(api, 'GET', '/divisas', { token: e.vendedor.token });
    expect(lista.json<{ operaciones: DivisaJson[] }>().operaciones.map((o) => o.id)).toEqual([
      compra.id,
    ]);
  });

  it('opciones trae las líneas con su tasa, los billetes y el turno con sus monedas', async () => {
    const e = await escenario();
    const respuesta = await llamar(nuevaApp(), 'GET', '/divisas/opciones', {
      token: e.vendedor.token,
    });
    expect(respuesta.statusCode).toBe(200);
    const opciones = respuesta.json<{
      lineas: { id: string; tasaCompra: string; denominaciones: { id: string }[] }[];
      miTurno: { monedas: string[] };
    }>();
    const linea = opciones.lineas.find((l) => l.id === e.linea);
    expect(linea?.tasaCompra).toBe('3950.000000');
    expect(linea?.denominaciones.map((d) => d.id)).toEqual(
      expect.arrayContaining([billete100, billete20]),
    );
    expect(opciones.miTurno.monedas).toEqual(['COP', 'USD']);
  });
});
