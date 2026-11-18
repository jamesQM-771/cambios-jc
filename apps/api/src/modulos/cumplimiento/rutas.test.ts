import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { cerrarApp, crearAppPrueba } from '../../../test/ayudas.js';
import {
  abrirSesion,
  asegurarEmpresa,
  conSesion,
  crearUsuarioDePrueba,
  cuerpoError,
  llamar,
} from '../../../test/auth.js';
import { abrirTurnoDePrueba } from '../../../test/turnos.js';
import { normalizarDocumento, normalizarNombre } from '../../lib/cumplimiento.js';
import { crearPrisma, type PrismaClient } from '../../lib/prisma.js';

let prisma: PrismaClient;
let app: FastifyInstance | undefined;

const APAGADOS = {
  umbralFichaMensual: null,
  fraccionamientoCantidad: null,
  fraccionamientoMontoMaximo: null,
  concentracionRemitentes: null,
};

beforeAll(async () => {
  prisma = crearPrisma();
  await asegurarEmpresa(prisma);
});

// Las reglas con umbral empiezan apagadas en cada prueba (los parámetros son de toda la instalación).
beforeEach(async () => {
  await prisma.parametrosCumplimiento.upsert({
    where: { unica: true },
    update: APAGADOS,
    create: APAGADOS,
  });
});

afterAll(async () => {
  await prisma.parametrosCumplimiento.update({ where: { unica: true }, data: APAGADOS });
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

async function sesion(rol: 'administrador' | 'vendedor' | 'digitador') {
  const usuario = await crearUsuarioDePrueba(prisma, { rol });
  return { id: usuario.id, token: await abrirSesion(prisma, usuario.id) };
}

const poner = (api: FastifyInstance, url: string, token: string, cuerpo: unknown) =>
  api.inject({ method: 'PUT', url, headers: conSesion(token), payload: cuerpo as object });

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
  await prisma.tasa.create({
    data: { lineaNegocioId: linea.id, tasaVenta: '4.000000', publicadaPorId: admin.id },
  });
  const caja = await prisma.cuentaDinero.create({
    data: { nombre: `Caja ${unico()}`, tipo: 'caja', moneda: 'COP', sucursalId: sucursal.id },
  });
  await abrirTurnoDePrueba(prisma, { usuarioId: vendedor.id, cuentaCajaId: caja.id });
  const banco = await prisma.banco.upsert({
    where: { codigo: '9127' },
    update: {},
    create: { codigo: '9127', nombre: 'Banco de cumplimiento' },
  });
  const persona = (tipoDocumento: 'CC' | 'V', nombre: string) =>
    prisma.cliente.create({
      data: { tipoDocumento, numeroDocumento: digitos(), nombre, creadoPorId: vendedor.id },
    });
  const remitente = await persona('CC', `Remitente ${unico()}`);
  const beneficiario = await persona('V', `Beneficiario ${unico()}`);
  const medio = async (clienteId: string) =>
    (
      await prisma.medioPago.create({
        data: {
          clienteId,
          tipo: 'pago_movil',
          bancoId: banco.id,
          telefonoPagoMovil: `0414${digitos().slice(0, 7)}`,
          titular: 'Titular',
          tipoDocumentoTitular: 'V',
          numeroDocumentoTitular: '12345678',
        },
      })
    ).id;
  const medioPagoId = await medio(beneficiario.id);
  const remesa = (api: FastifyInstance, extra: Record<string, unknown> = {}) =>
    llamar(api, 'POST', '/remesas', {
      token: vendedor.token,
      cuerpo: {
        claveIdempotencia: randomUUID(),
        lineaNegocioId: linea.id,
        remitenteId: remitente.id,
        medioPagoId,
        formaPago: 'efectivo',
        cuentaIngresoId: caja.id,
        montoPesos: '40000',
        ...extra,
      },
    });
  return { admin, vendedor, digitador, remitente, beneficiario, remesa, persona, medio };
}

describe('normalizar', () => {
  it('documento y nombre comparables', () => {
    expect(normalizarDocumento('v-12.345.678')).toBe('V12345678');
    expect(normalizarNombre('  José   PÉREZ ')).toBe('jose perez');
  });
});

describe('acceso', () => {
  it('la bandeja, la lista, los parámetros y el exporte son del administrador; la ficha, de quien atiende', async () => {
    const e = await escenario();
    const api = nuevaApp();
    for (const [metodo, url] of [
      ['GET', '/cumplimiento/alertas'],
      ['GET', '/cumplimiento/lista'],
      ['GET', '/cumplimiento/parametros'],
      ['GET', '/cumplimiento/exportes/operaciones?desde=2026-11-01&hasta=2026-11-01'],
    ] as const) {
      const respuesta = await llamar(api, metodo, url, { token: e.vendedor.token });
      expect(respuesta.statusCode, url).toBe(403);
      expect(cuerpoError(respuesta).codigo).toBe('SIN_PERMISO');
    }
    const ficha = await llamar(api, 'GET', `/cumplimiento/clientes/${e.remitente.id}`, {
      token: e.vendedor.token,
    });
    expect(ficha.statusCode).toBe(200);
    expect(ficha.json()).toMatchObject({ alertas: [] });
    const nivel = await poner(
      api,
      `/cumplimiento/clientes/${e.remitente.id}/nivel`,
      e.vendedor.token,
      {
        nivel: 'alto',
        motivo: 'No debería poder',
      },
    );
    expect(nivel.statusCode).toBe(403);
    const digitador = await llamar(api, 'GET', `/cumplimiento/clientes/${e.remitente.id}`, {
      token: e.digitador.token,
    });
    expect(digitador.statusCode).toBe(403);
  });
});

describe('lista restrictiva', () => {
  it('una coincidencia por documento bloquea la remesa y deja la alerta escalada', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const agregada = await llamar(api, 'POST', '/cumplimiento/lista', {
      token: e.admin.token,
      cuerpo: {
        fuente: 'ofac',
        nombre: 'Otro Nombre Cualquiera',
        numeroDocumento: `V-${e.beneficiario.numeroDocumento}`,
      },
    });
    expect(agregada.statusCode).toBe(201);

    const bloqueada = await e.remesa(api);
    expect(bloqueada.statusCode).toBe(409);
    expect(cuerpoError(bloqueada).mensaje).toMatch(/lista restrictiva/);
    const alerta = await prisma.alertaCumplimiento.findFirst({
      where: { clienteId: e.beneficiario.id, tipo: 'lista_restrictiva' },
    });
    expect(alerta).toMatchObject({ estado: 'escalada' });
    expect(await prisma.operacion.count({ where: { remitenteId: e.remitente.id } })).toBe(0);

    // Desactivada la entrada, la remesa pasa.
    const { entrada } = agregada.json<{ entrada: { id: string } }>();
    await llamar(api, 'PATCH', `/cumplimiento/lista/${entrada.id}`, {
      token: e.admin.token,
      cuerpo: { activa: false },
    });
    expect((await e.remesa(api)).statusCode).toBe(201);
  });

  it('también coincide por nombre, sin importar tildes ni mayúsculas', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const nombre = `Sancionádo ${unico()}`;
    await prisma.cliente.update({ where: { id: e.remitente.id }, data: { nombre } });
    await llamar(api, 'POST', '/cumplimiento/lista', {
      token: e.admin.token,
      cuerpo: { fuente: 'propia', nombre: nombre.toUpperCase().replace('Á', 'A') },
    });
    expect((await e.remesa(api)).statusCode).toBe(409);
  });
});

describe('reglas con umbral (apagadas por defecto)', () => {
  it('sin parámetros no hay alertas; con fraccionamiento configurado, alerta sin bloquear', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await e.remesa(api);
    await e.remesa(api);
    expect(await prisma.alertaCumplimiento.count({ where: { clienteId: e.remitente.id } })).toBe(0);

    const guardados = await poner(api, '/cumplimiento/parametros', e.admin.token, {
      ...APAGADOS,
      fraccionamientoCantidad: 2,
      fraccionamientoMontoMaximo: '50000',
    });
    expect(guardados.statusCode).toBe(200);
    const tercera = await e.remesa(api);
    expect(tercera.statusCode).toBe(201);
    const alerta = await prisma.alertaCumplimiento.findFirst({
      where: { clienteId: e.remitente.id, tipo: 'fraccionamiento' },
    });
    expect(alerta).toMatchObject({ estado: 'abierta', detalle: { operaciones24h: 3, limite: 2 } });
  });

  it('el umbral mensual exige la ficha ampliada; completa, deja pasar', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await poner(api, '/cumplimiento/parametros', e.admin.token, {
      ...APAGADOS,
      umbralFichaMensual: '100000',
    });
    expect((await e.remesa(api, { montoPesos: '60000' })).statusCode).toBe(201);
    const exige = await e.remesa(api, { montoPesos: '60000' });
    expect(exige.statusCode).toBe(409);
    expect(cuerpoError(exige).mensaje).toMatch(/ficha ampliada/);

    const ficha = await poner(
      api,
      `/cumplimiento/clientes/${e.remitente.id}/ficha`,
      e.vendedor.token,
      {
        actividadEconomica: 'Comerciante',
        origenFondos: 'Ventas de su negocio',
        pep: false,
      },
    );
    expect(ficha.statusCode).toBe(200);
    expect((await e.remesa(api, { montoPesos: '60000' })).statusCode).toBe(201);

    const consulta = await llamar(api, 'GET', `/cumplimiento/clientes/${e.remitente.id}`, {
      token: e.admin.token,
    });
    expect(consulta.json()).toMatchObject({
      perfil: { actividadEconomica: 'Comerciante', nivel: 'bajo' },
      acumulados: { comoRemitente: { dia: '120000.00', mes: '120000.00' } },
    });
  });

  it('concentración: un beneficiario que recibe de varios remitentes', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await poner(api, '/cumplimiento/parametros', e.admin.token, {
      ...APAGADOS,
      concentracionRemitentes: 1,
    });
    await e.remesa(api);
    const otro = await e.persona('CC', `Otro remitente ${unico()}`);
    expect((await e.remesa(api, { remitenteId: otro.id })).statusCode).toBe(201);
    const alerta = await prisma.alertaCumplimiento.findFirst({
      where: { clienteId: e.beneficiario.id, tipo: 'concentracion' },
    });
    expect(alerta).toMatchObject({ detalle: { remitentes30d: 2, limite: 1 } });
  });

  it('los parámetros piden cantidad y monto juntos para el fraccionamiento', async () => {
    const e = await escenario();
    const respuesta = await poner(nuevaApp(), '/cumplimiento/parametros', e.admin.token, {
      ...APAGADOS,
      fraccionamientoCantidad: 3,
    });
    expect(respuesta.statusCode).toBe(400);
  });
});

describe('bandeja, nivel y exporte', () => {
  it('el administrador escala y luego descarta con justificación; una descartada no cambia', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const alerta = await prisma.alertaCumplimiento.create({
      data: { tipo: 'fraccionamiento', clienteId: e.remitente.id, detalle: { prueba: true } },
    });
    const escalar = await llamar(api, 'POST', `/cumplimiento/alertas/${alerta.id}/escalar`, {
      token: e.admin.token,
      cuerpo: { justificacion: 'Patrón repetido esta semana' },
    });
    expect(escalar.statusCode).toBe(200);
    expect(escalar.json()).toMatchObject({ alerta: { estado: 'escalada' } });
    const descartar = await llamar(api, 'POST', `/cumplimiento/alertas/${alerta.id}/descartar`, {
      token: e.admin.token,
      cuerpo: { justificacion: 'Revisado con el cliente: pagos de nómina' },
    });
    expect(descartar.json()).toMatchObject({ alerta: { estado: 'descartada' } });
    const otraVez = await llamar(api, 'POST', `/cumplimiento/alertas/${alerta.id}/escalar`, {
      token: e.admin.token,
      cuerpo: { justificacion: 'Otra vez de nuevo' },
    });
    expect(otraVez.statusCode).toBe(409);
    const lista = await llamar(api, 'GET', '/cumplimiento/alertas', {
      token: e.admin.token,
      consulta: 'estado=descartada',
    });
    expect(lista.json<{ alertas: { id: string }[] }>().alertas.map((a) => a.id)).toContain(
      alerta.id,
    );
  });

  it('el nivel de riesgo lo cambia el administrador con motivo, y queda en la bitácora', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const nivel = await poner(
      api,
      `/cumplimiento/clientes/${e.remitente.id}/nivel`,
      e.admin.token,
      {
        nivel: 'alto',
        motivo: 'Marca PEP confirmada',
      },
    );
    expect(nivel.statusCode).toBe(200);
    const perfil = await prisma.perfilRiesgo.findUnique({ where: { clienteId: e.remitente.id } });
    expect(perfil).toMatchObject({ nivel: 'alto', motivoNivel: 'Marca PEP confirmada' });
    expect(
      await prisma.auditoria.count({
        where: { accion: 'cumplimiento.nivel', entidadId: e.remitente.id },
      }),
    ).toBe(1);
  });

  it('el exporte es un CSV con las operaciones del periodo', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await e.remesa(api);
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const respuesta = await llamar(api, 'GET', '/cumplimiento/exportes/operaciones', {
      token: e.admin.token,
      consulta: `desde=${hoy}&hasta=${hoy}`,
    });
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.headers['content-type']).toMatch(/text\/csv/);
    const [encabezado, ...filas] = respuesta.body.trim().split('\r\n');
    expect(encabezado).toContain('"documento_cliente"');
    expect(filas.some((f) => f.includes(e.remitente.numeroDocumento))).toBe(true);
  });
});
