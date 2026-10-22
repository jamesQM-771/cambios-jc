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
  cajaAjena: string;
  boveda: string;
  banco: string;
  categoriaId: string;
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
  const cuenta = (nombre: string, tipo: 'caja' | 'billetera') =>
    prisma.cuentaDinero.create({
      data: { nombre: `${nombre} ${unico()}`, tipo, moneda: 'COP', sucursalId: sucursal.id },
    });
  const [cajaVendedor, cajaAjena, boveda, banco, categoria] = await Promise.all([
    cuenta('Caja', 'caja'),
    cuenta('Caja', 'caja'),
    cuenta('Bóveda', 'caja'),
    cuenta('Billetera', 'billetera'),
    prisma.categoriaGasto.create({ data: { nombre: `Categoría ${unico()}` } }),
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
    categoriaId: categoria.id,
    turnoVendedorId: turno.turnoId,
  };
}

const cuerpo = (e: Escenario, cuentaId: string, extra: Record<string, unknown> = {}) => ({
  claveIdempotencia: randomUUID(),
  categoriaId: e.categoriaId,
  descripcion: 'Resma de papel y tóner',
  cuentaId,
  monto: '85000',
  ...extra,
});

interface GastoJson {
  id: string;
  tipo: string;
  categoria: { id: string } | null;
  descripcion: string;
  cuenta: { id: string; sucursal: { nombre: string } };
  monto: string;
  turno: { id: string } | null;
  creadoPor: { id: string };
  anulado: { por: { id: string }; motivo: string } | null;
}

const gastoDe = (respuesta: { json: () => unknown }): GastoJson =>
  (respuesta.json() as { gasto: GastoJson }).gasto;

const saldo = async (cuentaId: string) => (await saldoDeCuenta(prisma, cuentaId)).toFixed(2);

describe('acceso', () => {
  it('exige sesión y permisos', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const gasto = gastoDe(
      await llamar(api, 'POST', '/gastos', {
        token: e.admin.token,
        cuerpo: cuerpo(e, e.boveda),
      }),
    );

    expect((await llamar(api, 'POST', '/gastos', { cuerpo: cuerpo(e, e.boveda) })).statusCode).toBe(
      401,
    );
    for (const [metodo, url, extra] of [
      ['POST', '/gastos', { cuerpo: cuerpo(e, e.boveda) }],
      ['GET', '/gastos/opciones', {}],
    ] as const) {
      const respuesta = await llamar(api, metodo, url, { token: e.digitador.token, ...extra });
      expect(respuesta.statusCode, `${metodo} ${url}`).toBe(403);
      expect(cuerpoError(respuesta).codigo).toBe('SIN_PERMISO');
    }
    // Ver todos los gastos y anular es del administrador.
    for (const [metodo, url, extra] of [
      ['GET', '/gastos', {}],
      ['GET', `/gastos/${gasto.id}`, {}],
      ['POST', `/gastos/${gasto.id}/anular`, { cuerpo: { motivo: 'prueba' } }],
    ] as const) {
      const respuesta = await llamar(api, metodo, url, { token: e.vendedor.token, ...extra });
      expect(respuesta.statusCode, `${metodo} ${url}`).toBe(403);
    }
  });
});

describe('registrar un gasto', () => {
  it('el vendedor lo paga con la caja de su turno: sale de la caja y queda en el turno', async () => {
    const e = await escenario();

    const respuesta = await llamar(nuevaApp(), 'POST', '/gastos', {
      token: e.vendedor.token,
      cuerpo: cuerpo(e, e.cajaVendedor, { monto: '85000.50' }),
    });

    expect(respuesta.statusCode).toBe(201);
    expect(gastoDe(respuesta)).toMatchObject({
      tipo: 'operativo',
      categoria: { id: e.categoriaId },
      descripcion: 'Resma de papel y tóner',
      cuenta: { id: e.cajaVendedor },
      monto: '85000.50',
      turno: { id: e.turnoVendedorId },
      creadoPor: { id: e.vendedor.id },
      anulado: null,
    });
    expect(await saldo(e.cajaVendedor)).toBe('-85000.50');
    const movimiento = await prisma.movimientoCuenta.findFirstOrThrow({
      where: { gastoId: gastoDe(respuesta).id },
    });
    expect(movimiento).toMatchObject({
      cuentaId: e.cajaVendedor,
      sentido: 'salida',
      origen: 'gasto',
      turnoId: e.turnoVendedorId,
    });
  });

  it('el administrador paga desde cualquier cuenta, con o sin turno', async () => {
    const e = await escenario();

    const respuesta = await llamar(nuevaApp(), 'POST', '/gastos', {
      token: e.admin.token,
      cuerpo: cuerpo(e, e.banco, { monto: '1500000' }),
    });

    expect(respuesta.statusCode).toBe(201);
    expect(gastoDe(respuesta).turno).toBeNull();
    expect(await saldo(e.banco)).toBe('-1500000.00');
  });

  it('un retiro del dueño es solo del administrador, no lleva categoría y sale como retiro', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const retiro = (extra: Record<string, unknown> = {}) => ({
      claveIdempotencia: randomUUID(),
      tipo: 'retiro_dueno',
      descripcion: 'Retiro del dueño',
      cuentaId: e.boveda,
      monto: '3000000',
      ...extra,
    });

    const vendedor = await llamar(api, 'POST', '/gastos', {
      token: e.vendedor.token,
      cuerpo: retiro({ cuentaId: e.cajaVendedor }),
    });
    const admin = await llamar(api, 'POST', '/gastos', { token: e.admin.token, cuerpo: retiro() });

    expect(vendedor.statusCode).toBe(403);
    expect(admin.statusCode).toBe(201);
    expect(gastoDe(admin)).toMatchObject({ tipo: 'retiro_dueno', categoria: null });
    const movimiento = await prisma.movimientoCuenta.findFirstOrThrow({
      where: { gastoId: gastoDe(admin).id },
    });
    expect(movimiento.origen).toBe('retiro_dueno');
    expect(await saldo(e.boveda)).toBe('-3000000.00');
  });

  describe('qué se rechaza', () => {
    it('un gasto operativo sin categoría', async () => {
      const e = await escenario();

      const respuesta = await llamar(nuevaApp(), 'POST', '/gastos', {
        token: e.admin.token,
        cuerpo: cuerpo(e, e.boveda, { categoriaId: undefined }),
      });

      expect(respuesta.statusCode).toBe(400);
      expect(await saldo(e.boveda)).toBe('0.00');
    });

    it('sin turno abierto, el vendedor no registra gastos', async () => {
      const e = await escenario();
      const sinTurno = await sesion('vendedor');

      const respuesta = await llamar(nuevaApp(), 'POST', '/gastos', {
        token: sinTurno.token,
        cuerpo: cuerpo(e, e.cajaVendedor),
      });

      expect(respuesta.statusCode).toBe(409);
      expect(cuerpoError(respuesta).mensaje).toBe(
        'Abre tu turno de caja antes de registrar un gasto.',
      );
    });

    it('el vendedor solo paga con el efectivo de la caja de su turno', async () => {
      const e = await escenario();
      const api = nuevaApp();

      for (const cuentaId of [e.cajaAjena, e.boveda, e.banco]) {
        const respuesta = await llamar(api, 'POST', '/gastos', {
          token: e.vendedor.token,
          cuerpo: cuerpo(e, cuentaId),
        });
        expect(respuesta.statusCode, cuentaId).toBe(409);
      }
      expect(await saldo(e.cajaAjena)).toBe('0.00');
    });

    it('monto inválido, con decimales de más, cuenta o categoría inexistentes o desactivadas', async () => {
      const e = await escenario();
      const api = nuevaApp();
      const enviar = (extra: Record<string, unknown>) =>
        llamar(api, 'POST', '/gastos', {
          token: e.admin.token,
          cuerpo: cuerpo(e, e.boveda, extra),
        });

      for (const monto of ['0', '-5', '1e3', 'abc', '10.1234', '']) {
        expect((await enviar({ monto })).statusCode, monto).toBe(400);
      }
      expect((await enviar({ monto: '10.555' })).statusCode).toBe(409);
      expect((await enviar({ descripcion: 'x' })).statusCode).toBe(400);
      expect((await enviar({ categoriaId: randomUUID() })).statusCode).toBe(409);
      expect((await enviar({ cuentaId: randomUUID() })).statusCode).toBe(409);
      await prisma.categoriaGasto.update({
        where: { id: e.categoriaId },
        data: { activa: false },
      });
      expect((await enviar({})).statusCode).toBe(409);
      expect(await saldo(e.boveda)).toBe('0.00');
    });

    it('no acepta campos que no existen', async () => {
      const e = await escenario();

      const respuesta = await llamar(nuevaApp(), 'POST', '/gastos', {
        token: e.admin.token,
        cuerpo: cuerpo(e, e.boveda, { turnoId: randomUUID() }),
      });

      expect(respuesta.statusCode).toBe(400);
    });
  });

  describe('idempotencia', () => {
    it('repetir la petición devuelve el mismo gasto y no saca plata otra vez', async () => {
      const e = await escenario();
      const api = nuevaApp();
      const c = cuerpo(e, e.cajaVendedor);

      const primera = await llamar(api, 'POST', '/gastos', { token: e.vendedor.token, cuerpo: c });
      const segunda = await llamar(api, 'POST', '/gastos', { token: e.vendedor.token, cuerpo: c });

      expect(primera.statusCode).toBe(201);
      expect(segunda.statusCode).toBe(200);
      expect(gastoDe(segunda).id).toBe(gastoDe(primera).id);
      expect(await prisma.movimientoCuenta.count({ where: { gastoId: gastoDe(primera).id } })).toBe(
        1,
      );
      expect(await saldo(e.cajaVendedor)).toBe('-85000.00');
    });

    it('dos peticiones simultáneas con la misma clave crean un solo gasto', async () => {
      const e = await escenario();
      const api = nuevaApp();
      const c = cuerpo(e, e.cajaVendedor);

      const [a, b] = await Promise.all([
        llamar(api, 'POST', '/gastos', { token: e.vendedor.token, cuerpo: c }),
        llamar(api, 'POST', '/gastos', { token: e.vendedor.token, cuerpo: c }),
      ]);

      expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
      expect(gastoDe(a).id).toBe(gastoDe(b).id);
      expect(await saldo(e.cajaVendedor)).toBe('-85000.00');
    });

    it('otra persona no puede reutilizar la clave de alguien más', async () => {
      const e = await escenario();
      const api = nuevaApp();
      const c = cuerpo(e, e.cajaVendedor);
      await llamar(api, 'POST', '/gastos', { token: e.vendedor.token, cuerpo: c });

      const respuesta = await llamar(api, 'POST', '/gastos', { token: e.admin.token, cuerpo: c });

      expect(respuesta.statusCode).toBe(409);
    });
  });

  it('queda en la bitácora', async () => {
    const e = await escenario();

    const gasto = gastoDe(
      await llamar(nuevaApp(), 'POST', '/gastos', {
        token: e.vendedor.token,
        cuerpo: cuerpo(e, e.cajaVendedor),
      }),
    );

    const registro = await prisma.auditoria.findFirst({
      where: { accion: 'gasto.registrar', entidadId: gasto.id },
    });
    expect(registro?.usuarioId).toBe(e.vendedor.id);
    expect(JSON.stringify(registro?.despues)).toContain('85000.00');
  });
});

describe('anular un gasto', () => {
  it('el administrador lo anula con motivo y la plata vuelve a la cuenta', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const gasto = gastoDe(
      await llamar(api, 'POST', '/gastos', {
        token: e.vendedor.token,
        cuerpo: cuerpo(e, e.cajaVendedor),
      }),
    );

    const respuesta = await llamar(api, 'POST', `/gastos/${gasto.id}/anular`, {
      token: e.admin.token,
      cuerpo: { motivo: 'Se registró dos veces' },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(gastoDe(respuesta).anulado).toMatchObject({
      por: { id: e.admin.id },
      motivo: 'Se registró dos veces',
    });
    expect(await saldo(e.cajaVendedor)).toBe('0.00');
    const reversa = await prisma.movimientoCuenta.findFirstOrThrow({
      where: { gastoId: gasto.id, origen: 'gasto_anulacion' },
    });
    expect(reversa).toMatchObject({ sentido: 'entrada', cuentaId: e.cajaVendedor });
    expect(reversa.revierteId).not.toBeNull();
    // Nada se borra: el movimiento original sigue en el libro.
    expect(await prisma.movimientoCuenta.count({ where: { gastoId: gasto.id } })).toBe(2);
    const registro = await prisma.auditoria.findFirst({
      where: { accion: 'gasto.anular', entidadId: gasto.id },
    });
    expect(JSON.stringify(registro?.despues)).toContain('Se registró dos veces');
  });

  it('no se anula dos veces, ni sin motivo, ni uno que no existe', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const gasto = gastoDe(
      await llamar(api, 'POST', '/gastos', { token: e.admin.token, cuerpo: cuerpo(e, e.banco) }),
    );
    const anular = (id: string, motivo: string) =>
      llamar(api, 'POST', `/gastos/${id}/anular`, { token: e.admin.token, cuerpo: { motivo } });

    expect((await anular(gasto.id, '')).statusCode).toBe(400);
    expect((await anular(gasto.id, 'Error de digitación')).statusCode).toBe(200);
    expect((await anular(gasto.id, 'Otra vez')).statusCode).toBe(409);
    expect((await anular(randomUUID(), 'No existe')).statusCode).toBe(404);
    expect(await saldo(e.banco)).toBe('0.00');
  });

  it('dos anulaciones simultáneas devuelven la plata una sola vez', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const gasto = gastoDe(
      await llamar(api, 'POST', '/gastos', { token: e.admin.token, cuerpo: cuerpo(e, e.banco) }),
    );

    const [a, b] = await Promise.all([
      llamar(api, 'POST', `/gastos/${gasto.id}/anular`, {
        token: e.admin.token,
        cuerpo: { motivo: 'Primera' },
      }),
      llamar(api, 'POST', `/gastos/${gasto.id}/anular`, {
        token: e.admin.token,
        cuerpo: { motivo: 'Segunda' },
      }),
    ]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect(await saldo(e.banco)).toBe('0.00');
  });
});

describe('consultar', () => {
  it('el administrador lista y filtra por tipo, cuenta y categoría', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const operativo = gastoDe(
      await llamar(api, 'POST', '/gastos', { token: e.admin.token, cuerpo: cuerpo(e, e.banco) }),
    );
    const retiro = gastoDe(
      await llamar(api, 'POST', '/gastos', {
        token: e.admin.token,
        cuerpo: {
          claveIdempotencia: randomUUID(),
          tipo: 'retiro_dueno',
          descripcion: 'Retiro del dueño',
          cuentaId: e.boveda,
          monto: '1000000',
        },
      }),
    );
    const ids = async (consulta: string) =>
      (await llamar(api, 'GET', '/gastos', { token: e.admin.token, consulta }))
        .json<{ gastos: GastoJson[] }>()
        .gastos.map((g) => g.id);

    expect(await ids(`cuentaId=${e.banco}`)).toEqual([operativo.id]);
    expect(await ids('tipo=retiro_dueno&cuentaId=' + e.boveda)).toEqual([retiro.id]);
    expect(await ids(`categoriaId=${e.categoriaId}`)).toEqual([operativo.id]);
    const uno = await llamar(api, 'GET', `/gastos/${operativo.id}`, { token: e.admin.token });
    expect(gastoDe(uno).id).toBe(operativo.id);
  });

  it('las opciones traen categorías, cuentas, el turno y si puede gestionar', async () => {
    const e = await escenario();
    const api = nuevaApp();

    const vendedor = (
      await llamar(api, 'GET', '/gastos/opciones', { token: e.vendedor.token })
    ).json<{
      categorias: { id: string }[];
      cuentas: { id: string; cajaId: string | null }[];
      miTurno: { id: string } | null;
      puedeGestionar: boolean;
    }>();
    const admin = (await llamar(api, 'GET', '/gastos/opciones', { token: e.admin.token })).json<{
      miTurno: unknown;
      puedeGestionar: boolean;
    }>();

    expect(vendedor.categorias.map((c) => c.id)).toContain(e.categoriaId);
    expect(vendedor.miTurno?.id).toBe(e.turnoVendedorId);
    expect(vendedor.puedeGestionar).toBe(false);
    expect(vendedor.cuentas.find((c) => c.id === e.boveda)?.cajaId).toBeNull();
    expect(admin).toMatchObject({ miTurno: null, puedeGestionar: true });
  });

  it('la base impide un gasto operativo sin categoría o con monto en cero', async () => {
    const e = await escenario();
    const datos = {
      tipo: 'operativo' as const,
      categoriaId: e.categoriaId,
      descripcion: 'Prueba',
      cuentaId: e.boveda,
      monto: '10',
      claveIdempotencia: randomUUID(),
      creadoPorId: e.admin.id,
    };

    await expect(
      prisma.gasto.create({
        data: { ...datos, categoriaId: null, claveIdempotencia: randomUUID() },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.gasto.create({ data: { ...datos, monto: '0', claveIdempotencia: randomUUID() } }),
    ).rejects.toThrow();
  });
});
