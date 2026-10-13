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

const NOMBRE_REMITENTE = 'Remitente Reservado del Seguimiento';
const TITULAR = 'Titular Reservado del Seguimiento';

/** Una remesa en efectivo de 162.000 pesos a tasa 3,76, creada por la API como lo haría el vendedor. */
async function remesaRegistrada() {
  const usuario = await crearUsuarioDePrueba(prisma, { rol: 'vendedor' });
  const vendedor = { id: usuario.id, token: await abrirSesion(prisma, usuario.id) };
  const dueno = await crearUsuarioDePrueba(prisma, { rol: 'administrador' });
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
    data: { lineaNegocioId: linea.id, tasaVenta: '3.760000', publicadaPorId: dueno.id },
  });
  const caja = await prisma.cuentaDinero.create({
    data: { nombre: `Caja ${unico()}`, tipo: 'caja', moneda: 'COP', sucursalId: sucursal.id },
  });
  const banco = await prisma.banco.upsert({
    where: { codigo: '9128' },
    update: {},
    create: { codigo: '9128', nombre: 'Banco de prueba del seguimiento' },
  });
  const sufijo = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 90) + 10);
  const remitente = await prisma.cliente.create({
    data: {
      tipoDocumento: 'CC',
      numeroDocumento: `34${sufijo}`,
      nombre: NOMBRE_REMITENTE,
      creadoPorId: vendedor.id,
    },
  });
  const beneficiario = await prisma.cliente.create({
    data: {
      tipoDocumento: 'V',
      numeroDocumento: `44${sufijo}`,
      nombre: 'Beneficiario del seguimiento',
      creadoPorId: vendedor.id,
    },
  });
  const numeroCuenta = `9128${sufijo}${'0'.repeat(8)}`;
  const medio = await prisma.medioPago.create({
    data: {
      clienteId: beneficiario.id,
      tipo: 'cuenta_bancaria',
      bancoId: banco.id,
      numeroCuenta,
      titular: TITULAR,
      tipoDocumentoTitular: 'V',
      numeroDocumentoTitular: '99887766',
    },
  });
  const respuesta = await llamar(nuevaApp(), 'POST', '/remesas', {
    token: vendedor.token,
    cuerpo: {
      claveIdempotencia: randomUUID(),
      lineaNegocioId: linea.id,
      remitenteId: remitente.id,
      medioPagoId: medio.id,
      formaPago: 'efectivo',
      cuentaIngresoId: caja.id,
      montoPesos: '162000',
    },
  });
  const { remesa } = respuesta.json<{
    remesa: { id: string; numeroComprobante: number; codigoSeguimiento: string };
  }>();
  return {
    vendedor,
    remesaId: remesa.id,
    numero: remesa.numeroComprobante,
    codigo: remesa.codigoSeguimiento,
    numeroCuenta,
    documentoRemitente: `34${sufijo}`,
  };
}

interface SeguimientoJson {
  numeroComprobante: number;
  estado: string;
  mensaje: string;
  montoBolivaresTexto: string;
  empresa: { nombre: string; zonaHoraria: string };
}

const seguimientoDe = (respuesta: { json: () => unknown }): SeguimientoJson =>
  (respuesta.json() as { seguimiento: SeguimientoJson }).seguimiento;

describe('código de seguimiento', () => {
  it('cada remesa recibe uno propio, con el alfabeto sin letras confusas', async () => {
    const primera = await remesaRegistrada();
    const segunda = await remesaRegistrada();

    expect(primera.codigo).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(segunda.codigo).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(primera.codigo).not.toBe(segunda.codigo);
  });

  it('el vendedor lo ve en la remesa y el recibo trae el enlace para compartir', async () => {
    const { vendedor, remesaId, codigo } = await remesaRegistrada();
    const api = nuevaApp();

    const detalle = await llamar(api, 'GET', `/remesas/${remesaId}`, { token: vendedor.token });
    const recibo = await llamar(api, 'POST', `/remesas/${remesaId}/recibo`, {
      token: vendedor.token,
    });

    expect(detalle.json<{ remesa: { codigoSeguimiento: string } }>().remesa.codigoSeguimiento).toBe(
      codigo,
    );
    const datos = recibo.json<{
      recibo: { codigoSeguimiento: string; urlSeguimiento: string; texto: string };
    }>().recibo;
    expect(datos.codigoSeguimiento).toBe(codigo);
    expect(datos.urlSeguimiento).toMatch(new RegExp(`/seguimiento/${codigo}$`));
    expect(datos.texto).toContain(`Seguimiento: ${datos.urlSeguimiento}`);
  });
});

describe('consulta pública', () => {
  it('no pide sesión y devuelve solo estado, bolívares y fechas', async () => {
    const { codigo, numero } = await remesaRegistrada();

    const respuesta = await llamar(nuevaApp(), 'GET', `/seguimiento/${codigo}`);

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    expect(seguimientoDe(respuesta)).toMatchObject({
      numeroComprobante: numero,
      estado: 'en_proceso',
      montoBolivaresTexto: 'VES 43.085,106',
    });
    expect(seguimientoDe(respuesta).empresa.zonaHoraria).toEqual(expect.any(String));
  });

  it('no revela cuenta, cédulas, titular, pesos, tasa ni quién atendió', async () => {
    const { codigo, numeroCuenta, documentoRemitente } = await remesaRegistrada();

    const respuesta = await llamar(nuevaApp(), 'GET', `/seguimiento/${codigo}`);

    const texto = respuesta.body;
    for (const secreto of [
      NOMBRE_REMITENTE,
      TITULAR,
      numeroCuenta,
      documentoRemitente,
      '99887766',
      '162000',
      '162.000',
      'tasa',
      'vendedor',
      'remitente',
      'creadoPor',
    ]) {
      expect(texto, secreto).not.toContain(secreto);
    }
  });

  it('acepta el código en minúsculas y con guiones', async () => {
    const { codigo } = await remesaRegistrada();
    const escrito = `${codigo.slice(0, 4)}-${codigo.slice(4, 8)}-${codigo.slice(8)}`.toLowerCase();

    const respuesta = await llamar(nuevaApp(), 'GET', `/seguimiento/${escrito}`);

    expect(respuesta.statusCode).toBe(200);
  });

  it.each([
    ['recibida', 'registrada'],
    ['en_proceso', 'en_cola'],
    ['en_proceso', 'tomada'],
    ['enviada', 'completada'],
    ['en_revision', 'con_incidencia'],
    ['anulada', 'anulada'],
    ['devuelta', 'devuelta'],
  ] as const)('muestra "%s" cuando la remesa está %s', async (esperado, estadoInterno) => {
    const { codigo, remesaId } = await remesaRegistrada();
    await prisma.operacion.update({ where: { id: remesaId }, data: { estado: estadoInterno } });

    const respuesta = await llamar(nuevaApp(), 'GET', `/seguimiento/${codigo}`);

    const seguimiento = seguimientoDe(respuesta);
    expect(seguimiento.estado).toBe(esperado);
    expect(seguimiento.mensaje.length).toBeGreaterThan(10);
  });

  it('un código que no existe y uno mal escrito responden igual', async () => {
    const api = nuevaApp();

    const inexistente = await llamar(api, 'GET', '/seguimiento/ZZZZZZZZZZZZ');
    const malEscrito = await llamar(api, 'GET', '/seguimiento/abc');

    expect(inexistente.statusCode).toBe(404);
    expect(malEscrito.statusCode).toBe(404);
    expect(cuerpoError(malEscrito)).toEqual(cuerpoError(inexistente));
  });

  it('limita las consultas por IP: la 31 en un minuto responde 429', async () => {
    const api = nuevaApp();

    const respuestas = [];
    for (let i = 0; i < 31; i += 1) {
      respuestas.push(await llamar(api, 'GET', '/seguimiento/ZZZZZZZZZZZZ'));
    }

    expect(respuestas.slice(0, 30).every((r) => r.statusCode === 404)).toBe(true);
    expect(respuestas[30]?.statusCode).toBe(429);
  });
});
