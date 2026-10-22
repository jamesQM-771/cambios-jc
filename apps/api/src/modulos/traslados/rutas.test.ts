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
import { abrirTurnoDePrueba } from '../../../test/turnos.js';
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
  /** Caja del turno abierto del vendedor. */
  cajaVendedor: string;
  /** Caja física de otro puesto (otro turno, otra persona). */
  cajaAjena: string;
  /** Efectivo de la sucursal sin puesto. */
  boveda: string;
  banco: string;
  cuentaVes: string;
  turnoVendedorId: string;
}

async function escenario(): Promise<Escenario> {
  const [vendedor, admin, digitador, otro] = await Promise.all([
    sesion('vendedor'),
    sesion('administrador'),
    sesion('digitador'),
    sesion('vendedor'),
  ]);
  const sucursal = await prisma.sucursal.create({
    data: { nombre: `Sucursal ${unico()}`, ciudad: 'Cúcuta' },
  });
  const cuenta = (nombre: string, tipo: 'caja' | 'banco' | 'billetera', moneda: 'COP' | 'VES') =>
    prisma.cuentaDinero.create({
      data: { nombre: `${nombre} ${unico()}`, tipo, moneda, sucursalId: sucursal.id },
    });
  const [cajaVendedor, cajaAjena, boveda, banco, cuentaVes] = await Promise.all([
    cuenta('Caja', 'caja', 'COP'),
    cuenta('Caja', 'caja', 'COP'),
    cuenta('Bóveda', 'caja', 'COP'),
    cuenta('Billetera', 'billetera', 'COP'),
    cuenta('Banco VES', 'billetera', 'VES'),
  ]);
  const turno = await abrirTurnoDePrueba(prisma, {
    usuarioId: vendedor.id,
    cuentaCajaId: cajaVendedor.id,
  });
  await abrirTurnoDePrueba(prisma, { usuarioId: otro.id, cuentaCajaId: cajaAjena.id });
  return {
    vendedor,
    admin,
    digitador,
    cajaVendedor: cajaVendedor.id,
    cajaAjena: cajaAjena.id,
    boveda: boveda.id,
    banco: banco.id,
    cuentaVes: cuentaVes.id,
    turnoVendedorId: turno.turnoId,
  };
}

const cuerpo = (origenId: string, destinoId: string, extra: Record<string, unknown> = {}) => ({
  claveIdempotencia: randomUUID(),
  origenId,
  destinoId,
  monto: '100000',
  ...extra,
});

interface TrasladoJson {
  id: string;
  origen: { id: string };
  destino: { id: string };
  monto: string;
  nota: string | null;
  turno: { id: string } | null;
  creadoPor: { id: string };
  anulado: { por: { id: string }; motivo: string } | null;
}

const trasladoDe = (respuesta: { json: () => unknown }): TrasladoJson =>
  (respuesta.json() as { traslado: TrasladoJson }).traslado;

const saldo = async (cuentaId: string) => (await saldoDeCuenta(prisma, cuentaId)).toFixed(2);

describe('acceso', () => {
  it('exige sesión y permisos', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const traslado = trasladoDe(
      await llamar(api, 'POST', '/traslados', {
        token: e.admin.token,
        cuerpo: cuerpo(e.cajaVendedor, e.boveda),
      }),
    );

    expect(
      (await llamar(api, 'POST', '/traslados', { cuerpo: cuerpo(e.cajaVendedor, e.boveda) }))
        .statusCode,
    ).toBe(401);
    for (const [metodo, url, extra] of [
      ['POST', '/traslados', { cuerpo: cuerpo(e.cajaVendedor, e.boveda) }],
      ['GET', '/traslados/opciones', {}],
    ] as const) {
      const respuesta = await llamar(api, metodo, url, { token: e.digitador.token, ...extra });
      expect(respuesta.statusCode, `${metodo} ${url}`).toBe(403);
      expect(cuerpoError(respuesta).codigo).toBe('SIN_PERMISO');
    }
    // Ver todos los traslados y anular es del administrador.
    for (const [metodo, url, extra] of [
      ['GET', '/traslados', {}],
      ['GET', `/traslados/${traslado.id}`, {}],
      ['POST', `/traslados/${traslado.id}/anular`, { cuerpo: { motivo: 'prueba' } }],
    ] as const) {
      const respuesta = await llamar(api, metodo, url, { token: e.vendedor.token, ...extra });
      expect(respuesta.statusCode, `${metodo} ${url}`).toBe(403);
    }
  });
});

describe('registrar un traslado', () => {
  it('de la caja del vendedor a la bóveda: una salida y una entrada, en su turno', async () => {
    const e = await escenario();

    const respuesta = await llamar(nuevaApp(), 'POST', '/traslados', {
      token: e.vendedor.token,
      cuerpo: cuerpo(e.cajaVendedor, e.boveda, { monto: '150000.50', nota: 'Excedente de caja' }),
    });

    expect(respuesta.statusCode).toBe(201);
    expect(trasladoDe(respuesta)).toMatchObject({
      origen: { id: e.cajaVendedor },
      destino: { id: e.boveda },
      monto: '150000.50',
      nota: 'Excedente de caja',
      turno: { id: e.turnoVendedorId },
      creadoPor: { id: e.vendedor.id },
      anulado: null,
    });
    expect(await saldo(e.cajaVendedor)).toBe('-150000.50');
    expect(await saldo(e.boveda)).toBe('150000.50');
    const movimientos = await prisma.movimientoCuenta.findMany({
      where: { trasladoId: trasladoDe(respuesta).id },
      orderBy: { sentido: 'asc' },
    });
    expect(movimientos.map((m) => [m.cuentaId, m.sentido, m.origen, m.turnoId])).toEqual([
      [e.boveda, 'entrada', 'traslado_entrada', e.turnoVendedorId],
      [e.cajaVendedor, 'salida', 'traslado_salida', e.turnoVendedorId],
    ]);
  });

  it('de la bóveda a su caja (fondeo)', async () => {
    const e = await escenario();

    const respuesta = await llamar(nuevaApp(), 'POST', '/traslados', {
      token: e.vendedor.token,
      cuerpo: cuerpo(e.boveda, e.cajaVendedor),
    });

    expect(respuesta.statusCode).toBe(201);
    expect(await saldo(e.cajaVendedor)).toBe('100000.00');
  });

  it('el administrador mueve entre cualesquiera cuentas, sin necesitar turno', async () => {
    const e = await escenario();

    const respuesta = await llamar(nuevaApp(), 'POST', '/traslados', {
      token: e.admin.token,
      cuerpo: cuerpo(e.boveda, e.banco, { monto: '2500000' }),
    });

    expect(respuesta.statusCode).toBe(201);
    expect(trasladoDe(respuesta).turno).toBeNull();
    expect(await saldo(e.banco)).toBe('2500000.00');
    expect(await saldo(e.boveda)).toBe('-2500000.00');
  });

  it('un monto de doce dígitos se guarda exacto', async () => {
    const e = await escenario();

    const cop = await llamar(nuevaApp(), 'POST', '/traslados', {
      token: e.admin.token,
      cuerpo: cuerpo(e.boveda, e.banco, { monto: '999999999999.99' }),
    });
    expect(cop.statusCode).toBe(201);
    expect(await saldo(e.banco)).toBe('999999999999.99');
  });

  describe('qué se rechaza', () => {
    it('sin turno abierto, el vendedor no traslada', async () => {
      const e = await escenario();
      const sinTurno = await sesion('vendedor');

      const respuesta = await llamar(nuevaApp(), 'POST', '/traslados', {
        token: sinTurno.token,
        cuerpo: cuerpo(e.cajaVendedor, e.boveda),
      });

      expect(respuesta.statusCode).toBe(409);
      expect(cuerpoError(respuesta).mensaje).toBe(
        'Abre tu turno de caja antes de hacer un traslado.',
      );
    });

    it('el vendedor solo mueve desde o hacia la caja de su turno', async () => {
      const e = await escenario();
      const api = nuevaApp();

      const ajena = await llamar(api, 'POST', '/traslados', {
        token: e.vendedor.token,
        cuerpo: cuerpo(e.cajaAjena, e.boveda),
      });
      const entreOtras = await llamar(api, 'POST', '/traslados', {
        token: e.vendedor.token,
        cuerpo: cuerpo(e.boveda, e.banco),
      });

      expect(ajena.statusCode).toBe(409);
      expect(entreOtras.statusCode).toBe(409);
      expect(await saldo(e.boveda)).toBe('0.00');
    });

    it('origen y destino distintos, de la misma moneda, activos y con monto válido', async () => {
      const e = await escenario();
      const api = nuevaApp();
      const enviar = (c: Record<string, unknown>) =>
        llamar(api, 'POST', '/traslados', { token: e.admin.token, cuerpo: c });

      expect((await enviar(cuerpo(e.boveda, e.boveda))).statusCode).toBe(400);
      expect((await enviar(cuerpo(e.boveda, e.cuentaVes))).statusCode).toBe(409);
      for (const monto of ['0', '-5', '1e3', 'abc', '10.1234', '']) {
        expect((await enviar(cuerpo(e.boveda, e.banco, { monto }))).statusCode, monto).toBe(400);
      }
      // COP admite 2 decimales: 3 no se redondean en silencio.
      const decimales = await enviar(cuerpo(e.boveda, e.banco, { monto: '10.555' }));
      expect(decimales.statusCode).toBe(409);
      await prisma.cuentaDinero.update({ where: { id: e.banco }, data: { activa: false } });
      expect((await enviar(cuerpo(e.boveda, e.banco))).statusCode).toBe(409);
      expect((await enviar(cuerpo(randomUUID(), e.boveda))).statusCode).toBe(409);
      expect(await saldo(e.boveda)).toBe('0.00');
    });

    it('no acepta campos que no existen', async () => {
      const e = await escenario();

      const respuesta = await llamar(nuevaApp(), 'POST', '/traslados', {
        token: e.admin.token,
        cuerpo: cuerpo(e.boveda, e.banco, { turnoId: randomUUID() }),
      });

      expect(respuesta.statusCode).toBe(400);
    });
  });

  describe('idempotencia', () => {
    it('repetir la petición devuelve el mismo traslado y no mueve dinero otra vez', async () => {
      const e = await escenario();
      const api = nuevaApp();
      const c = cuerpo(e.cajaVendedor, e.boveda);

      const primera = await llamar(api, 'POST', '/traslados', {
        token: e.vendedor.token,
        cuerpo: c,
      });
      const segunda = await llamar(api, 'POST', '/traslados', {
        token: e.vendedor.token,
        cuerpo: c,
      });

      expect(primera.statusCode).toBe(201);
      expect(segunda.statusCode).toBe(200);
      expect(trasladoDe(segunda).id).toBe(trasladoDe(primera).id);
      expect(
        await prisma.movimientoCuenta.count({ where: { trasladoId: trasladoDe(primera).id } }),
      ).toBe(2);
      expect(await saldo(e.boveda)).toBe('100000.00');
    });

    it('dos peticiones simultáneas con la misma clave crean un solo traslado', async () => {
      const e = await escenario();
      const api = nuevaApp();
      const c = cuerpo(e.cajaVendedor, e.boveda);

      const [a, b] = await Promise.all([
        llamar(api, 'POST', '/traslados', { token: e.vendedor.token, cuerpo: c }),
        llamar(api, 'POST', '/traslados', { token: e.vendedor.token, cuerpo: c }),
      ]);

      expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
      expect(trasladoDe(a).id).toBe(trasladoDe(b).id);
      expect(await saldo(e.boveda)).toBe('100000.00');
    });

    it('otra persona no puede reutilizar la clave de alguien más', async () => {
      const e = await escenario();
      const api = nuevaApp();
      const c = cuerpo(e.cajaVendedor, e.boveda);
      await llamar(api, 'POST', '/traslados', { token: e.vendedor.token, cuerpo: c });

      const respuesta = await llamar(api, 'POST', '/traslados', {
        token: e.admin.token,
        cuerpo: c,
      });

      expect(respuesta.statusCode).toBe(409);
    });
  });

  it('queda en la bitácora', async () => {
    const e = await escenario();

    const traslado = trasladoDe(
      await llamar(nuevaApp(), 'POST', '/traslados', {
        token: e.vendedor.token,
        cuerpo: cuerpo(e.cajaVendedor, e.boveda),
      }),
    );

    const registro = await prisma.auditoria.findFirst({
      where: { accion: 'traslado.registrar', entidadId: traslado.id },
    });
    expect(registro?.usuarioId).toBe(e.vendedor.id);
    expect(JSON.stringify(registro?.despues)).toContain('100000.00');
  });
});

describe('anular un traslado', () => {
  it('el administrador lo anula con motivo y el dinero vuelve a donde estaba', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const traslado = trasladoDe(
      await llamar(api, 'POST', '/traslados', {
        token: e.vendedor.token,
        cuerpo: cuerpo(e.cajaVendedor, e.boveda),
      }),
    );

    const respuesta = await llamar(api, 'POST', `/traslados/${traslado.id}/anular`, {
      token: e.admin.token,
      cuerpo: { motivo: 'Se contó mal el efectivo' },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(trasladoDe(respuesta).anulado).toMatchObject({
      por: { id: e.admin.id },
      motivo: 'Se contó mal el efectivo',
    });
    expect(await saldo(e.cajaVendedor)).toBe('0.00');
    expect(await saldo(e.boveda)).toBe('0.00');
    const reversas = await prisma.movimientoCuenta.findMany({
      where: { trasladoId: traslado.id, origen: 'traslado_anulacion' },
    });
    expect(reversas).toHaveLength(2);
    expect(reversas.every((r) => r.revierteId !== null)).toBe(true);
    // Nada se borra: los dos movimientos originales siguen en el libro.
    expect(await prisma.movimientoCuenta.count({ where: { trasladoId: traslado.id } })).toBe(4);
    const registro = await prisma.auditoria.findFirst({
      where: { accion: 'traslado.anular', entidadId: traslado.id },
    });
    expect(JSON.stringify(registro?.despues)).toContain('Se contó mal el efectivo');
  });

  it('no se anula dos veces, ni una vez sin motivo, ni uno que no existe', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const traslado = trasladoDe(
      await llamar(api, 'POST', '/traslados', {
        token: e.admin.token,
        cuerpo: cuerpo(e.boveda, e.banco),
      }),
    );
    const anular = (id: string, motivo: string) =>
      llamar(api, 'POST', `/traslados/${id}/anular`, { token: e.admin.token, cuerpo: { motivo } });

    expect((await anular(traslado.id, '')).statusCode).toBe(400);
    expect((await anular(traslado.id, 'Error de digitación')).statusCode).toBe(200);
    expect((await anular(traslado.id, 'Otra vez')).statusCode).toBe(409);
    expect((await anular(randomUUID(), 'No existe')).statusCode).toBe(404);
    expect(await saldo(e.banco)).toBe('0.00');
  });

  it('dos anulaciones simultáneas deshacen el traslado una sola vez', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const traslado = trasladoDe(
      await llamar(api, 'POST', '/traslados', {
        token: e.admin.token,
        cuerpo: cuerpo(e.boveda, e.banco),
      }),
    );

    const [a, b] = await Promise.all([
      llamar(api, 'POST', `/traslados/${traslado.id}/anular`, {
        token: e.admin.token,
        cuerpo: { motivo: 'Primera' },
      }),
      llamar(api, 'POST', `/traslados/${traslado.id}/anular`, {
        token: e.admin.token,
        cuerpo: { motivo: 'Segunda' },
      }),
    ]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect(await saldo(e.banco)).toBe('0.00');
    expect(await saldo(e.boveda)).toBe('0.00');
  });
});

describe('consultar', () => {
  it('el administrador lista y filtra por cuenta', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const uno = trasladoDe(
      await llamar(api, 'POST', '/traslados', {
        token: e.admin.token,
        cuerpo: cuerpo(e.boveda, e.banco),
      }),
    );
    await llamar(api, 'POST', '/traslados', {
      token: e.admin.token,
      cuerpo: cuerpo(e.cajaVendedor, e.boveda),
    });

    const porBanco = await llamar(api, 'GET', '/traslados', {
      token: e.admin.token,
      consulta: `cuentaId=${e.banco}`,
    });
    const porBoveda = await llamar(api, 'GET', '/traslados', {
      token: e.admin.token,
      consulta: `cuentaId=${e.boveda}`,
    });
    const uno2 = await llamar(api, 'GET', `/traslados/${uno.id}`, { token: e.admin.token });

    expect(porBanco.json<{ traslados: TrasladoJson[] }>().traslados.map((t) => t.id)).toEqual([
      uno.id,
    ]);
    expect(porBoveda.json<{ traslados: TrasladoJson[] }>().traslados).toHaveLength(2);
    expect(trasladoDe(uno2).id).toBe(uno.id);
  });

  it('las opciones traen las cuentas, el turno y si puede mover entre cualesquiera', async () => {
    const e = await escenario();
    const api = nuevaApp();

    const vendedor = (
      await llamar(api, 'GET', '/traslados/opciones', { token: e.vendedor.token })
    ).json<{
      cuentas: { id: string; cajaId: string | null }[];
      miTurno: { id: string } | null;
      puedeCualquierCuenta: boolean;
    }>();
    const admin = (await llamar(api, 'GET', '/traslados/opciones', { token: e.admin.token })).json<{
      miTurno: unknown;
      puedeCualquierCuenta: boolean;
    }>();

    expect(vendedor.miTurno?.id).toBe(e.turnoVendedorId);
    expect(vendedor.puedeCualquierCuenta).toBe(false);
    expect(vendedor.cuentas.map((c) => c.id)).toEqual(
      expect.arrayContaining([e.cajaVendedor, e.boveda, e.banco]),
    );
    expect(vendedor.cuentas.find((c) => c.id === e.boveda)?.cajaId).toBeNull();
    expect(admin).toMatchObject({ miTurno: null, puedeCualquierCuenta: true });
  });
});

describe('el libro de movimientos', () => {
  it('la base impide un traslado a la misma cuenta o con monto en cero', async () => {
    const e = await escenario();
    const datos = {
      origenId: e.boveda,
      destinoId: e.banco,
      monto: '10',
      claveIdempotencia: randomUUID(),
      creadoPorId: e.admin.id,
    };

    await expect(
      prisma.traslado.create({
        data: { ...datos, destinoId: e.boveda, claveIdempotencia: randomUUID() },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.traslado.create({ data: { ...datos, monto: '0', claveIdempotencia: randomUUID() } }),
    ).rejects.toThrow();
  });
});
