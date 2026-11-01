import { randomUUID } from 'node:crypto';

import { aDecimal } from '@cambios-jc/shared';
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
const digitos = () => String(Math.floor(Math.random() * 9e8) + 1e8);
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

async function sesion(rol: 'administrador' | 'vendedor') {
  const usuario = await crearUsuarioDePrueba(prisma, { rol });
  return { id: usuario.id, token: await abrirSesion(prisma, usuario.id) };
}

async function escenario() {
  const [admin, vendedor] = await Promise.all([sesion('administrador'), sesion('vendedor')]);
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
    data: { lineaNegocioId: linea.id, tasaVenta: '4.000000', publicadaPorId: admin.id },
  });
  const caja = await prisma.cuentaDinero.create({
    data: { nombre: `Caja ${unico()}`, tipo: 'caja', moneda: 'COP', sucursalId: sucursal.id },
  });
  await abrirTurnoDePrueba(prisma, { usuarioId: vendedor.id, cuentaCajaId: caja.id });
  const banco = await prisma.banco.upsert({
    where: { codigo: '9128' },
    update: {},
    create: { codigo: '9128', nombre: 'Banco de reportes' },
  });
  const nombreRemitente = `Remitente Reporte ${unico()}`;
  const remitente = await prisma.cliente.create({
    data: {
      tipoDocumento: 'CC',
      numeroDocumento: digitos(),
      nombre: nombreRemitente,
      creadoPorId: vendedor.id,
    },
  });
  const beneficiario = await prisma.cliente.create({
    data: {
      tipoDocumento: 'V',
      numeroDocumento: digitos(),
      nombre: `Beneficiario ${unico()}`,
      creadoPorId: vendedor.id,
    },
  });
  const medio = await prisma.medioPago.create({
    data: {
      clienteId: beneficiario.id,
      tipo: 'pago_movil',
      bancoId: banco.id,
      telefonoPagoMovil: `0414${digitos().slice(0, 7)}`,
      titular: 'Titular',
      tipoDocumentoTitular: 'V',
      numeroDocumentoTitular: '12345678',
    },
  });
  const api = nuevaApp();
  const respuesta = await llamar(api, 'POST', '/remesas', {
    token: vendedor.token,
    cuerpo: {
      claveIdempotencia: randomUUID(),
      lineaNegocioId: linea.id,
      remitenteId: remitente.id,
      medioPagoId: medio.id,
      formaPago: 'efectivo',
      cuentaIngresoId: caja.id,
      montoPesos: '80000',
      tasaManual: undefined,
    },
  });
  const { remesa } = respuesta.json<{ remesa: { id: string; numeroComprobante: number } }>();
  return { api, admin, vendedor, remesa, nombreRemitente, documento: remitente.numeroDocumento };
}

describe('acceso', () => {
  it('reportes, histórico, exportación y migración son solo del administrador', async () => {
    const e = await escenario();
    for (const [metodo, url, cuerpo] of [
      ['GET', '/reportes/tablero', undefined],
      ['GET', '/reportes/buscar', undefined],
      ['GET', `/reportes/ganancia?desde=${hoy()}&hasta=${hoy()}`, undefined],
      ['GET', '/datos/exportacion', undefined],
      ['POST', '/datos/migracion/saldos-contrapartes', { csv: 'nombre,moneda,saldo\n' }],
    ] as const) {
      const respuesta = await llamar(e.api, metodo, url, { token: e.vendedor.token, cuerpo });
      expect(respuesta.statusCode, url).toBe(403);
      expect(cuerpoError(respuesta).codigo).toBe('SIN_PERMISO');
    }
  });
});

describe('tablero y reportes', () => {
  it('el tablero trae ganancia, liquidez (disponible − comprometido) y deudas', async () => {
    const e = await escenario();
    const respuesta = await llamar(e.api, 'GET', '/reportes/tablero', { token: e.admin.token });
    expect(respuesta.statusCode).toBe(200);
    const { tablero } = respuesta.json<{
      tablero: {
        remesasHoy: number;
        liquidez: { moneda: string; disponible: string; comprometido: string; libre: string }[];
      };
    }>();
    expect(tablero.remesasHoy).toBeGreaterThan(0);
    const ves = tablero.liquidez.find((l) => l.moneda === 'VES');
    expect(ves).toBeDefined();
    // La remesa en efectivo quedó en cola: compromete sus 20.000 Bs.
    expect(aDecimal(ves?.comprometido ?? '0').gte('20000')).toBe(true);
  });

  it('cada reporte responde una tabla, y en CSV como archivo para Excel', async () => {
    const e = await escenario();
    for (const nombre of [
      'ganancia',
      'top_clientes',
      'proveedores',
      'arqueo',
      'tasas_manuales',
      'costos_bancarios',
    ]) {
      const respuesta = await llamar(e.api, 'GET', `/reportes/${nombre}`, {
        token: e.admin.token,
        consulta: `desde=${hoy()}&hasta=${hoy()}`,
      });
      expect(respuesta.statusCode, nombre).toBe(200);
      expect(
        respuesta.json<{ reporte: { columnas: string[] } }>().reporte.columnas.length,
      ).toBeGreaterThan(1);
    }
    const top = await llamar(e.api, 'GET', '/reportes/top_clientes', {
      token: e.admin.token,
      consulta: `desde=${hoy()}&hasta=${hoy()}&formato=csv`,
    });
    expect(top.headers['content-type']).toMatch(/text\/csv/);
    expect(top.body.startsWith('﻿"Cliente"')).toBe(true);
    const malo = await llamar(e.api, 'GET', '/reportes/ganancia', {
      token: e.admin.token,
      consulta: `desde=${hoy()}&hasta=2020-01-01`,
    });
    expect(malo.statusCode).toBe(400);
  });

  it('la búsqueda avanzada encuentra por comprobante, por nombre y por fecha', async () => {
    const e = await escenario();
    const buscar = async (consulta: string) =>
      (await llamar(e.api, 'GET', '/reportes/buscar', { token: e.admin.token, consulta })).json<{
        resultados: { id: string; tipo: string }[];
      }>().resultados;
    expect(
      (await buscar(`comprobante=${String(e.remesa.numeroComprobante)}`)).map((r) => r.id),
    ).toEqual([e.remesa.id]);
    expect(
      (await buscar(`texto=${encodeURIComponent(e.nombreRemitente)}`)).map((r) => r.id),
    ).toContain(e.remesa.id);
    expect(
      (await buscar(`texto=${e.documento}&comparacion=igual&fecha=${hoy()}`)).map((r) => r.id),
    ).toContain(e.remesa.id);
    expect(await buscar(`texto=${e.documento}&comparacion=menor&fecha=2020-01-01`)).toEqual([]);
  });
});

describe('datos', () => {
  it('la exportación completa es un JSON descargable y queda en la bitácora', async () => {
    const e = await escenario();
    const respuesta = await llamar(e.api, 'GET', '/datos/exportacion', { token: e.admin.token });
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.headers['content-disposition']).toMatch(
      /attachment; filename="cambios-jc-datos-/,
    );
    const datos = JSON.parse(respuesta.body) as {
      clientes: unknown[];
      usuarios: Record<string, unknown>[];
    };
    expect(datos.clientes.length).toBeGreaterThan(0);
    // Nunca contraseñas ni secretos.
    expect(respuesta.body).not.toMatch(/hashContrasena|secreto2fa/);
    expect(
      await prisma.auditoria.count({ where: { accion: 'datos.exportar', usuarioId: e.admin.id } }),
    ).toBe(1);
  });

  it('la carga de saldos muestra, aplica con el signo invertido y no duplica', async () => {
    const e = await escenario();
    const nombre = `PROVEEDOR MIGRADO ${unico()}`;
    const csv = `nombre;moneda;saldo\n${nombre};COP;-1.250.000,50\n${nombre};VES;3500,125\n`;
    const vista = await llamar(e.api, 'POST', '/datos/migracion/saldos-contrapartes', {
      token: e.admin.token,
      cuerpo: { csv },
    });
    expect(vista.json()).toMatchObject({
      aplicadas: 0,
      filas: [
        {
          nombre,
          moneda: 'COP',
          saldoSistema: '1250000.50',
          etiqueta: 'me_debe',
          contraparteExiste: false,
        },
        { nombre, moneda: 'VES', saldoSistema: '-3500.125', etiqueta: 'le_debo' },
      ],
    });
    expect(await prisma.contraparte.count({ where: { nombre } })).toBe(0);

    const aplicada = await llamar(e.api, 'POST', '/datos/migracion/saldos-contrapartes', {
      token: e.admin.token,
      cuerpo: { csv, aplicar: true },
    });
    expect(aplicada.json()).toMatchObject({ aplicadas: 2, yaCargadas: 0 });
    const contraparte = await prisma.contraparte.findFirstOrThrow({ where: { nombre } });
    const detalle = await llamar(e.api, 'GET', `/contrapartes/${contraparte.id}`, {
      token: e.admin.token,
    });
    expect(detalle.json<{ contraparte: { saldos: unknown[] } }>().contraparte.saldos).toEqual([
      { moneda: 'COP', saldo: '1250000.50' },
      { moneda: 'VES', saldo: '-3500.125' },
    ]);
    const otraVez = await llamar(e.api, 'POST', '/datos/migracion/saldos-contrapartes', {
      token: e.admin.token,
      cuerpo: { csv, aplicar: true },
    });
    expect(otraVez.json()).toMatchObject({ aplicadas: 0, yaCargadas: 2 });

    const conError = await llamar(e.api, 'POST', '/datos/migracion/saldos-contrapartes', {
      token: e.admin.token,
      cuerpo: { csv: 'nombre,moneda,saldo\nX y,EUR,5\n', aplicar: true },
    });
    expect(conError.statusCode).toBe(409);
  });
});
