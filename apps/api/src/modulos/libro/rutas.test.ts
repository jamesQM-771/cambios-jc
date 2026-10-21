import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { cerrarApp, crearAppPrueba } from '../../../test/ayudas.js';
import {
  abrirSesion,
  asegurarEmpresa,
  conSesion,
  crearUsuarioDePrueba,
  llamar,
} from '../../../test/auth.js';
import { formularioConArchivos, pngDePrueba } from '../../../test/imagenes.js';
import { abrirTurnoDePrueba } from '../../../test/turnos.js';
import { crearPrisma, type PrismaClient } from '../../lib/prisma.js';
import { registrarMovimiento, saldoDeCuenta } from '../../lib/libro.js';

let prisma: PrismaClient;
let app: FastifyInstance | undefined;
let carpeta: string;

beforeAll(async () => {
  prisma = crearPrisma();
  await asegurarEmpresa(prisma);
  carpeta = await mkdtemp(join(tmpdir(), 'cambios-jc-libro-'));
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(carpeta, { recursive: true, force: true });
});

afterEach(async () => {
  await cerrarApp(app);
  app = undefined;
});

function nuevaApp(): FastifyInstance {
  app = crearAppPrueba({
    sesionReal: true,
    prisma: crearPrisma(),
    config: { CARPETA_SUBIDAS: carpeta },
  });
  return app;
}

const unico = () => randomUUID().slice(0, 8);

interface Sesion {
  id: string;
  token: string;
}

async function sesion(rol: 'administrador' | 'vendedor' | 'digitador'): Promise<Sesion> {
  const usuario = await crearUsuarioDePrueba(prisma, { rol });
  return { id: usuario.id, token: await abrirSesion(prisma, usuario.id) };
}

interface Escenario {
  vendedor: Sesion;
  admin: Sesion;
  digitador: Sesion;
  cajaId: string;
  bancoCuentaId: string;
  cuentaVesId: string;
  cuerpoRemesa: (extra?: Record<string, unknown>) => Record<string, unknown>;
}

/** Línea a tasa 5, una caja en pesos, una billetera en pesos y una cuenta en bolívares con comisión 1,5. */
async function escenario(): Promise<Escenario> {
  const [vendedor, admin, digitador] = await Promise.all([
    sesion('vendedor'),
    sesion('administrador'),
    sesion('digitador'),
  ]);
  const sucursal = await prisma.sucursal.create({
    data: { nombre: `Sucursal ${unico()}`, ciudad: 'Cúcuta' },
  });
  const linea = await prisma.lineaNegocio.create({
    data: {
      nombre: `Remesas ${unico()}`,
      clase: 'remesa',
      monedaOrigen: 'COP',
      monedaDestino: 'VES',
    },
  });
  await prisma.tasa.create({
    data: { lineaNegocioId: linea.id, tasaVenta: '5.000000', publicadaPorId: admin.id },
  });
  const cuentas = await Promise.all([
    prisma.cuentaDinero.create({
      data: { nombre: `Caja ${unico()}`, tipo: 'caja', moneda: 'COP', sucursalId: sucursal.id },
    }),
    prisma.cuentaDinero.create({
      data: {
        nombre: `Billetera ${unico()}`,
        tipo: 'billetera',
        moneda: 'COP',
        sucursalId: sucursal.id,
      },
    }),
    prisma.cuentaDinero.create({
      data: {
        nombre: `Banco VES ${unico()}`,
        tipo: 'billetera',
        moneda: 'VES',
        sucursalId: sucursal.id,
        comisionPorDefecto: '1.500',
      },
    }),
  ]);
  const [caja, billetera, cuentaVes] = cuentas;
  await abrirTurnoDePrueba(prisma, { usuarioId: vendedor.id, cuentaCajaId: caja.id });
  const banco = await prisma.banco.upsert({
    where: { codigo: '9500' },
    update: {},
    create: { codigo: '9500', nombre: 'Banco de prueba del libro' },
  });
  const sufijo = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 90) + 10);
  const remitente = await prisma.cliente.create({
    data: {
      tipoDocumento: 'CC',
      numeroDocumento: `36${sufijo}`,
      nombre: 'Remitente del libro',
      creadoPorId: vendedor.id,
    },
  });
  const beneficiario = await prisma.cliente.create({
    data: {
      tipoDocumento: 'V',
      numeroDocumento: `46${sufijo}`,
      nombre: 'Beneficiario del libro',
      creadoPorId: vendedor.id,
    },
  });
  const medio = await prisma.medioPago.create({
    data: {
      clienteId: beneficiario.id,
      tipo: 'cuenta_bancaria',
      bancoId: banco.id,
      numeroCuenta: `9500${sufijo}${'0'.repeat(8)}`,
      titular: 'Titular del libro',
      tipoDocumentoTitular: 'V',
      numeroDocumentoTitular: '11223344',
    },
  });
  return {
    vendedor,
    admin,
    digitador,
    cajaId: caja.id,
    bancoCuentaId: billetera.id,
    cuentaVesId: cuentaVes.id,
    cuerpoRemesa: (extra = {}) => ({
      claveIdempotencia: randomUUID(),
      lineaNegocioId: linea.id,
      remitenteId: remitente.id,
      medioPagoId: medio.id,
      formaPago: 'efectivo',
      cuentaIngresoId: caja.id,
      montoPesos: '50000',
      ...extra,
    }),
  };
}

interface MovimientoJson {
  cuenta: { id: string };
  sentido: 'entrada' | 'salida';
  monto: string;
  origen: string;
  revierteId: string | null;
  operacion: { id: string } | null;
}

const movimientosDe = async (e: Escenario, api: FastifyInstance, cuentaId: string) =>
  (
    await llamar(api, 'GET', `/libro/movimientos?cuentaId=${cuentaId}`, { token: e.admin.token })
  ).json<{ movimientos: MovimientoJson[] }>().movimientos;

const saldoDe = async (e: Escenario, api: FastifyInstance, cuentaId: string) => {
  const { saldos } = (await llamar(api, 'GET', '/libro/saldos', { token: e.admin.token })).json<{
    saldos: { cuenta: { id: string }; saldo: string }[];
  }>();
  return saldos.find((s) => s.cuenta.id === cuentaId)?.saldo;
};

const registrar = async (e: Escenario, api: FastifyInstance, extra: Record<string, unknown> = {}) =>
  (
    await llamar(api, 'POST', '/remesas', {
      token: e.vendedor.token,
      cuerpo: e.cuerpoRemesa(extra),
    })
  ).json<{ remesa: { id: string } }>().remesa.id;

function completar(e: Escenario, api: FastifyInstance, id: string, campos: Record<string, string>) {
  const formulario = formularioConArchivos([
    { campo: 'cuentaOrigenId', valor: e.cuentaVesId },
    ...Object.entries(campos).map(([campo, valor]) => ({ campo, valor })),
    {
      campo: 'comprobante',
      nombreArchivo: 'captura.png',
      tipoMime: 'image/png',
      contenido: pngDePrueba(50),
    },
  ]);
  return api.inject({
    method: 'POST',
    url: `/cola/${id}/completar`,
    headers: { ...formulario.headers, ...conSesion(e.digitador.token) },
    payload: formulario.payload,
  });
}

describe('acceso al libro', () => {
  const rutas = ['/libro/saldos', '/libro/movimientos'];

  it.each(rutas)('%s: sin sesión 401, y vendedor y digitador 403', async (ruta) => {
    const api = nuevaApp();
    const vendedor = await sesion('vendedor');
    const digitador = await sesion('digitador');

    expect((await llamar(api, 'GET', ruta)).statusCode).toBe(401);
    expect((await llamar(api, 'GET', ruta, { token: vendedor.token })).statusCode).toBe(403);
    expect((await llamar(api, 'GET', ruta, { token: digitador.token })).statusCode).toBe(403);
  });
});

describe('ingreso de una remesa', () => {
  it('en efectivo entra a la caja al registrarla', async () => {
    const e = await escenario();
    const api = nuevaApp();

    const id = await registrar(e, api);

    const movimientos = await movimientosDe(e, api, e.cajaId);
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]).toMatchObject({
      sentido: 'entrada',
      monto: '50000.00',
      origen: 'remesa_ingreso',
      operacion: { id },
    });
    expect(await saldoDe(e, api, e.cajaId)).toBe('50000.00');
  });

  it('por transferencia no entra nada hasta que el vendedor verifica el pago', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const extra = { formaPago: 'transferencia', cuentaIngresoId: e.bancoCuentaId };
    const id = await registrar(e, api, extra);

    const antes = await movimientosDe(e, api, e.bancoCuentaId);
    await llamar(api, 'POST', `/remesas/${id}/verificar-pago`, { token: e.vendedor.token });
    const despues = await movimientosDe(e, api, e.bancoCuentaId);

    expect(antes).toEqual([]);
    expect(despues).toHaveLength(1);
    expect(despues[0]).toMatchObject({ sentido: 'entrada', monto: '50000.00' });
  });

  it('un reintento con la misma clave no duplica el ingreso', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const cuerpo = e.cuerpoRemesa();

    await llamar(api, 'POST', '/remesas', { token: e.vendedor.token, cuerpo });
    await llamar(api, 'POST', '/remesas', { token: e.vendedor.token, cuerpo });

    expect(await movimientosDe(e, api, e.cajaId)).toHaveLength(1);
    expect(await saldoDe(e, api, e.cajaId)).toBe('50000.00');
  });

  it('dos verificaciones simultáneas dejan un solo ingreso', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const id = await registrar(e, api, {
      formaPago: 'transferencia',
      cuentaIngresoId: e.bancoCuentaId,
    });

    await Promise.all([
      llamar(api, 'POST', `/remesas/${id}/verificar-pago`, { token: e.vendedor.token }),
      llamar(api, 'POST', `/remesas/${id}/verificar-pago`, { token: e.vendedor.token }),
    ]);

    expect(await movimientosDe(e, api, e.bancoCuentaId)).toHaveLength(1);
  });

  it('una remesa rechazada no deja movimientos', async () => {
    const e = await escenario();
    const api = nuevaApp();

    const respuesta = await llamar(api, 'POST', '/remesas', {
      token: e.vendedor.token,
      cuerpo: e.cuerpoRemesa({ cuentaIngresoId: e.bancoCuentaId }),
    });

    expect(respuesta.statusCode).toBe(409);
    expect(await movimientosDe(e, api, e.bancoCuentaId)).toEqual([]);
  });
});

describe('anular', () => {
  it('revierte el ingreso con un movimiento contrario que apunta al original', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const id = await registrar(e, api);

    await llamar(api, 'POST', `/remesas/${id}/anular`, {
      token: e.admin.token,
      cuerpo: { motivo: 'Error del vendedor' },
    });

    const movimientos = await movimientosDe(e, api, e.cajaId);
    expect(movimientos).toHaveLength(2);
    const reversa = movimientos.find((m) => m.origen === 'remesa_anulacion');
    const original = movimientos.find((m) => m.origen === 'remesa_ingreso');
    expect(reversa).toMatchObject({ sentido: 'salida', monto: '50000.00' });
    expect(reversa?.revierteId).not.toBeNull();
    expect(original).toBeDefined();
    expect(await saldoDe(e, api, e.cajaId)).toBe('0.00');
  });

  it('una transferencia anulada antes de verificarse no tiene nada que revertir', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const id = await registrar(e, api, {
      formaPago: 'transferencia',
      cuentaIngresoId: e.bancoCuentaId,
    });

    await llamar(api, 'POST', `/remesas/${id}/anular`, {
      token: e.admin.token,
      cuerpo: { motivo: 'El cliente no pagó' },
    });

    expect(await movimientosDe(e, api, e.bancoCuentaId)).toEqual([]);
  });

  it('una anulación rechazada (ya tomada) no mueve el libro', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const id = await registrar(e, api);
    await llamar(api, 'POST', `/cola/${id}/tomar`, { token: e.digitador.token });

    const respuesta = await llamar(api, 'POST', `/remesas/${id}/anular`, {
      token: e.admin.token,
      cuerpo: { motivo: 'Tarde' },
    });

    expect(respuesta.statusCode).toBe(409);
    expect(await movimientosDe(e, api, e.cajaId)).toHaveLength(1);
  });
});

describe('pago de la remesa', () => {
  async function remesaTomada(e: Escenario, api: FastifyInstance) {
    const id = await registrar(e, api);
    await llamar(api, 'POST', `/cola/${id}/tomar`, { token: e.digitador.token });
    return id;
  }

  it('al completarla salen de la cuenta de origen los bolívares y el costo por defecto', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const id = await remesaTomada(e, api);

    const respuesta = await completar(e, api, id, {});

    expect(respuesta.statusCode).toBe(200);
    const movimientos = await movimientosDe(e, api, e.cuentaVesId);
    expect(movimientos.map((m) => [m.origen, m.sentido, m.monto]).sort()).toEqual([
      ['remesa_costo', 'salida', '1.500'],
      ['remesa_pago', 'salida', '10000.000'],
    ]);
    expect(await saldoDe(e, api, e.cuentaVesId)).toBe('-10001.500');
  });

  it('con un costo propio se usa ese; con costo cero solo sale el pago', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const conCosto = await remesaTomada(e, api);
    await completar(e, api, conCosto, { costoBancario: '2.25' });
    const saldoConCosto = await saldoDe(e, api, e.cuentaVesId);
    const sinCosto = await remesaTomada(e, api);

    await completar(e, api, sinCosto, { costoBancario: '0' });

    expect(saldoConCosto).toBe('-10002.250');
    expect(await saldoDe(e, api, e.cuentaVesId)).toBe('-20002.250');
  });

  it('un pago rechazado (referencia repetida) no deja movimientos', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const primera = await remesaTomada(e, api);
    const segunda = await remesaTomada(e, api);
    await completar(e, api, primera, { referenciaBancaria: 'REF-LIBRO-1' });
    const antes = await movimientosDe(e, api, e.cuentaVesId);

    const respuesta = await completar(e, api, segunda, { referenciaBancaria: 'REF-LIBRO-1' });

    expect(respuesta.statusCode).toBe(409);
    expect(await movimientosDe(e, api, e.cuentaVesId)).toHaveLength(antes.length);
  });
});

describe('consultas del libro', () => {
  it('el saldo de cada cuenta suma entradas y resta salidas, con todos sus decimales', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await registrar(e, api, { montoPesos: '12345.67' });
    await registrar(e, api, { montoPesos: '0.33' });

    expect(await saldoDe(e, api, e.cajaId)).toBe('12346.00');
    const { saldos } = (await llamar(api, 'GET', '/libro/saldos', { token: e.admin.token })).json<{
      saldos: { cuenta: { id: string; caja: unknown; moneda: string } }[];
    }>();
    expect(saldos.find((s) => s.cuenta.id === e.cuentaVesId)?.cuenta.moneda).toBe('VES');
  });

  it('filtra los movimientos por día en la zona de la empresa', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await registrar(e, api);
    const hoy = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const deHoy = await llamar(
      api,
      'GET',
      `/libro/movimientos?cuentaId=${e.cajaId}&desde=${hoy}&hasta=${hoy}`,
      { token: e.admin.token },
    );
    const deAyer = await llamar(
      api,
      'GET',
      `/libro/movimientos?cuentaId=${e.cajaId}&desde=2020-01-01&hasta=2020-01-02`,
      { token: e.admin.token },
    );
    const mala = await llamar(api, 'GET', '/libro/movimientos?desde=2026-13-45', {
      token: e.admin.token,
    });

    expect(deHoy.json<{ movimientos: unknown[] }>().movimientos).toHaveLength(1);
    expect(deAyer.json<{ movimientos: unknown[] }>().movimientos).toEqual([]);
    expect(mala.statusCode).toBe(400);
  });
});

describe('registrarMovimiento y saldoDeCuenta', () => {
  async function cuentaSuelta() {
    const usuario = await sesion('administrador');
    const sucursal = await prisma.sucursal.create({
      data: { nombre: `Sucursal ${unico()}`, ciudad: 'Cúcuta' },
    });
    const cuenta = await prisma.cuentaDinero.create({
      data: { nombre: `Cuenta ${unico()}`, tipo: 'caja', moneda: 'VES', sucursalId: sucursal.id },
    });
    return { usuarioId: usuario.id, cuentaId: cuenta.id };
  }

  it('mil movimientos de 0,001 suman exactamente 1,000', async () => {
    const { usuarioId, cuentaId } = await cuentaSuelta();

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < 1000; i += 1) {
        await registrarMovimiento(tx, {
          cuentaId,
          sentido: 'entrada',
          monto: '0.001',
          moneda: 'VES',
          origen: 'remesa_ingreso',
          usuarioId,
        });
      }
    });

    expect((await saldoDeCuenta(prisma, cuentaId)).toFixed(3)).toBe('1.000');
  });

  it('rechaza un monto en cero o negativo', async () => {
    const { usuarioId, cuentaId } = await cuentaSuelta();
    const base = {
      cuentaId,
      sentido: 'entrada',
      moneda: 'VES',
      origen: 'remesa_ingreso',
      usuarioId,
    } as const;

    await expect(
      prisma.$transaction((tx) => registrarMovimiento(tx, { ...base, monto: '0' })),
    ).rejects.toThrow('mayor que cero');
    await expect(
      prisma.$transaction((tx) => registrarMovimiento(tx, { ...base, monto: '-5' })),
    ).rejects.toThrow('mayor que cero');
    // 0,0004 se fija a 0,000 en bolívares: tampoco cuenta.
    await expect(
      prisma.$transaction((tx) => registrarMovimiento(tx, { ...base, monto: '0.0004' })),
    ).rejects.toThrow('mayor que cero');
  });

  it('la ventana de tiempo cuenta solo lo que se movió dentro', async () => {
    const { usuarioId, cuentaId } = await cuentaSuelta();
    const datos = { cuentaId, moneda: 'VES', origen: 'remesa_ingreso', usuarioId } as const;
    await prisma.$transaction(async (tx) => {
      await registrarMovimiento(tx, { ...datos, sentido: 'entrada', monto: '100' });
    });
    const corte = new Date();
    await new Promise((resolver) => setTimeout(resolver, 20));
    await prisma.$transaction(async (tx) => {
      await registrarMovimiento(tx, { ...datos, sentido: 'entrada', monto: '30' });
      await registrarMovimiento(tx, { ...datos, sentido: 'salida', monto: '5' });
    });

    expect((await saldoDeCuenta(prisma, cuentaId)).toFixed(3)).toBe('125.000');
    expect((await saldoDeCuenta(prisma, cuentaId, { desde: corte })).toFixed(3)).toBe('25.000');
    expect((await saldoDeCuenta(prisma, cuentaId, { hasta: corte })).toFixed(3)).toBe('100.000');
  });

  it('el libro es de solo inserción: la base rechaza cambiar o borrar un movimiento', async () => {
    const { usuarioId, cuentaId } = await cuentaSuelta();
    const id = await prisma.$transaction((tx) =>
      registrarMovimiento(tx, {
        cuentaId,
        sentido: 'entrada',
        monto: '10',
        moneda: 'VES',
        origen: 'remesa_ingreso',
        usuarioId,
      }),
    );

    await expect(
      prisma.movimientoCuenta.update({ where: { id }, data: { monto: '999' } }),
    ).rejects.toThrow();
    await expect(prisma.movimientoCuenta.delete({ where: { id } })).rejects.toThrow();
    expect((await saldoDeCuenta(prisma, cuentaId)).toFixed(3)).toBe('10.000');
  });

  it('un movimiento solo se puede revertir una vez', async () => {
    const { usuarioId, cuentaId } = await cuentaSuelta();
    const datos = { cuentaId, moneda: 'VES', origen: 'remesa_ingreso', usuarioId } as const;
    const original = await prisma.$transaction((tx) =>
      registrarMovimiento(tx, { ...datos, sentido: 'entrada', monto: '10' }),
    );
    await prisma.$transaction((tx) =>
      registrarMovimiento(tx, { ...datos, sentido: 'salida', monto: '10', revierteId: original }),
    );

    await expect(
      prisma.$transaction((tx) =>
        registrarMovimiento(tx, { ...datos, sentido: 'salida', monto: '10', revierteId: original }),
      ),
    ).rejects.toThrow();
  });
});
