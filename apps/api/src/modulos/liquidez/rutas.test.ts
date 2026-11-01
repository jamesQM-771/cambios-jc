import { randomUUID } from 'node:crypto';

import { aDecimal } from '@cambios-jc/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { cerrarApp, crearAppPrueba } from '../../../test/ayudas.js';
import {
  abrirSesion,
  asegurarEmpresa,
  conSesion,
  crearUsuarioDePrueba,
  cuerpoError,
  llamar,
} from '../../../test/auth.js';
import { registrarMovimiento } from '../../lib/libro.js';
import { crearPrisma, type PrismaClient } from '../../lib/prisma.js';

let prisma: PrismaClient;
let app: FastifyInstance | undefined;
const APAGADOS = { umbralLibre: null, porcentajeLimite: null };

beforeAll(async () => {
  prisma = crearPrisma();
  await asegurarEmpresa(prisma);
});

afterAll(async () => {
  await prisma.parametrosLiquidez.update({ where: { unica: true }, data: APAGADOS });
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

interface Tablero {
  monedas: {
    moneda: string;
    disponible: string;
    comprometido: string;
    libre: string;
    cuentas: { id: string; usadoHoy: string; restanteHoy: string | null }[];
  }[];
  alertas: { tipo: string; mensaje: string }[];
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
  const linea = await prisma.lineaNegocio.create({
    data: {
      nombre: `Remesas ${unico()}`,
      clase: 'remesa',
      monedaOrigen: 'COP',
      monedaDestino: 'VES',
    },
  });
  const cuenta = await prisma.cuentaDinero.create({
    data: {
      nombre: `Banco VES ${unico()}`,
      tipo: 'billetera',
      moneda: 'VES',
      sucursalId: sucursal.id,
      limiteDiario: '1000.000',
    },
  });
  return { admin, vendedor, digitador, linea: linea.id, cuenta: cuenta.id };
}

const mover = (cuentaId: string, sentido: 'entrada' | 'salida', monto: string, usuarioId: string) =>
  prisma.$transaction((tx) =>
    registrarMovimiento(tx, {
      cuentaId,
      sentido,
      monto,
      moneda: 'VES',
      origen: sentido === 'entrada' ? 'traslado_entrada' : 'traslado_salida',
      usuarioId,
    }),
  );

describe('liquidez', () => {
  it('el tablero es del administrador; el vendedor solo pregunta si alcanza', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const tablero = await llamar(api, 'GET', '/liquidez', { token: e.vendedor.token });
    expect(tablero.statusCode).toBe(403);
    expect(cuerpoError(tablero).codigo).toBe('SIN_PERMISO');
    const digitador = await llamar(api, 'GET', '/liquidez/alcanza', {
      token: e.digitador.token,
      consulta: `lineaNegocioId=${e.linea}&bolivares=1`,
    });
    expect(digitador.statusCode).toBe(403);
    const vendedor = await llamar(api, 'GET', '/liquidez/alcanza', {
      token: e.vendedor.token,
      consulta: `lineaNegocioId=${e.linea}&bolivares=999999999999`,
    });
    expect(vendedor.json()).toEqual({ alcanza: false });
  });

  it('libre = disponible − comprometido, y el límite diario cuenta las salidas de hoy', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await mover(e.cuenta, 'entrada', '5000000000', e.admin.id);
    await mover(e.cuenta, 'salida', '850', e.admin.id);
    const respuesta = await llamar(api, 'GET', '/liquidez', { token: e.admin.token });
    expect(respuesta.statusCode).toBe(200);
    const ves = respuesta.json<Tablero>().monedas.find((m) => m.moneda === 'VES');
    expect(ves).toBeDefined();
    if (!ves) return;
    expect(aDecimal(ves.libre).equals(aDecimal(ves.disponible).minus(ves.comprometido))).toBe(true);
    expect(ves.cuentas.find((c) => c.id === e.cuenta)).toMatchObject({
      usadoHoy: '850.000',
      restanteHoy: '150.000',
    });

    const alcanza = await llamar(api, 'GET', '/liquidez/alcanza', {
      token: e.vendedor.token,
      consulta: `lineaNegocioId=${e.linea}&bolivares=1000`,
    });
    expect(alcanza.json()).toEqual({ alcanza: true });
  });

  it('las alertas se encienden con sus parámetros', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await mover(e.cuenta, 'entrada', '10000', e.admin.id);
    await mover(e.cuenta, 'salida', '900', e.admin.id);
    const sin = await llamar(api, 'GET', '/liquidez', { token: e.admin.token });
    expect(sin.json<Tablero>().alertas.filter((a) => a.tipo !== 'cola_rapida')).toEqual([]);

    const params = await api.inject({
      method: 'PUT',
      url: '/liquidez/parametros',
      headers: conSesion(e.admin.token),
      payload: { umbralLibre: '999999999999999', porcentajeLimite: 80 },
    });
    expect(params.statusCode).toBe(200);
    const con = await llamar(api, 'GET', '/liquidez', { token: e.admin.token });
    const tipos = con.json<Tablero>().alertas;
    expect(tipos.some((a) => a.tipo === 'libre_bajo')).toBe(true);
    expect(tipos.some((a) => a.tipo === 'limite_cuenta' && a.mensaje.includes('900.000'))).toBe(
      true,
    );

    const malo = await api.inject({
      method: 'PUT',
      url: '/liquidez/parametros',
      headers: conSesion(e.admin.token),
      payload: { umbralLibre: null, porcentajeLimite: 150 },
    });
    expect(malo.statusCode).toBe(400);
    await prisma.parametrosLiquidez.update({ where: { unica: true }, data: APAGADOS });
  });
});
