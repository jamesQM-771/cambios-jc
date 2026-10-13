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

import { fechaEnZona } from './servicio.js';

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
  return { id: usuario.id, token: await abrirSesion(prisma, usuario.id), nombre: usuario.login };
}

interface ReciboJson {
  esCopia: boolean;
  numeroCopia: number;
  numeroComprobante: number;
  fechaTexto: string;
  montoPesosTexto: string;
  montoBolivaresTexto: string;
  vendedor: string;
  texto: string;
  empresa: { nombre: string; textoPie: string | null };
  remitente: { nombre: string; numeroDocumento: string };
  beneficiario: { titular: string; banco: { codigo: string }; numeroCuenta: string | null };
}

const reciboDe = (respuesta: { json: () => unknown }): ReciboJson =>
  (respuesta.json() as { recibo: ReciboJson }).recibo;

/** Una remesa en efectivo de 162.000 pesos a tasa 3,76, creada por la API como lo haría el vendedor. */
async function remesaRegistrada() {
  const vendedor = await sesion('vendedor');
  const admin = await sesion('administrador');
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
    data: { lineaNegocioId: linea.id, tasaVenta: '3.760000', publicadaPorId: admin.id },
  });
  const caja = await prisma.cuentaDinero.create({
    data: { nombre: `Caja ${unico()}`, tipo: 'caja', moneda: 'COP', sucursalId: sucursal.id },
  });
  const banco = await prisma.banco.upsert({
    where: { codigo: '9127' },
    update: {},
    create: { codigo: '9127', nombre: 'Banco de prueba del recibo' },
  });
  const sufijo = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 90) + 10);
  const remitente = await prisma.cliente.create({
    data: {
      tipoDocumento: 'CC',
      numeroDocumento: `33${sufijo}`,
      nombre: 'Remitente del recibo',
      creadoPorId: vendedor.id,
    },
  });
  const beneficiario = await prisma.cliente.create({
    data: {
      tipoDocumento: 'V',
      numeroDocumento: `43${sufijo}`,
      nombre: 'Beneficiario del recibo',
      creadoPorId: vendedor.id,
    },
  });
  const medio = await prisma.medioPago.create({
    data: {
      clienteId: beneficiario.id,
      tipo: 'cuenta_bancaria',
      bancoId: banco.id,
      numeroCuenta: `9127${sufijo}${'0'.repeat(8)}`,
      titular: 'Titular del recibo',
      tipoDocumentoTitular: 'V',
      numeroDocumentoTitular: '55667788',
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
  const { remesa } = respuesta.json<{ remesa: { id: string; numeroComprobante: number } }>();
  return { vendedor, admin, remesaId: remesa.id, numero: remesa.numeroComprobante, banco };
}

describe('acceso al recibo', () => {
  it('sin sesión responde 401 y el digitador recibe 403', async () => {
    const digitador = await sesion('digitador');
    const api = nuevaApp();
    const ruta = `/remesas/${randomUUID()}/recibo`;

    const sinSesion = await llamar(api, 'POST', ruta);
    const conDigitador = await llamar(api, 'POST', ruta, { token: digitador.token });

    expect(sinSesion.statusCode).toBe(401);
    expect(conDigitador.statusCode).toBe(403);
    expect(cuerpoError(conDigitador).codigo).toBe('SIN_PERMISO');
  });

  it('una remesa que no existe responde 404', async () => {
    const vendedor = await sesion('vendedor');

    const respuesta = await llamar(nuevaApp(), 'POST', `/remesas/${randomUUID()}/recibo`, {
      token: vendedor.token,
    });

    expect(respuesta.statusCode).toBe(404);
  });
});

describe('emitir el recibo', () => {
  it('el primero es el original y trae todo lo que lleva el ticket', async () => {
    const { vendedor, remesaId, numero, banco } = await remesaRegistrada();

    const respuesta = await llamar(nuevaApp(), 'POST', `/remesas/${remesaId}/recibo`, {
      token: vendedor.token,
    });

    expect(respuesta.statusCode).toBe(200);
    const recibo = reciboDe(respuesta);
    expect(recibo).toMatchObject({
      esCopia: false,
      numeroCopia: 0,
      numeroComprobante: numero,
      montoPesosTexto: 'COP 162.000',
      montoBolivaresTexto: 'VES 43.085,106',
      vendedor: 'Usuario de prueba',
      remitente: { nombre: 'Remitente del recibo' },
      beneficiario: { titular: 'Titular del recibo', banco: { codigo: banco.codigo } },
    });
    expect(recibo.fechaTexto).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    expect(recibo.texto).toContain(`Comprobante N° ${String(numero)}`);
    expect(recibo.texto).toContain('Recibido: COP 162.000');
    expect(recibo.texto).toContain('Envío: VES 43.085,106');
    expect(recibo.texto).not.toContain('COPIA');
  });

  it('cada reimpresión sale marcada como COPIA y queda registrada', async () => {
    const { vendedor, admin, remesaId } = await remesaRegistrada();
    const api = nuevaApp();
    const ruta = `/remesas/${remesaId}/recibo`;

    const original = reciboDe(await llamar(api, 'POST', ruta, { token: vendedor.token }));
    const primera = reciboDe(await llamar(api, 'POST', ruta, { token: vendedor.token }));
    const segunda = reciboDe(await llamar(api, 'POST', ruta, { token: admin.token }));

    expect([original.esCopia, primera.esCopia, segunda.esCopia]).toEqual([false, true, true]);
    expect([original.numeroCopia, primera.numeroCopia, segunda.numeroCopia]).toEqual([0, 1, 2]);
    expect(primera.texto).toContain('Comprobante N°');
    expect(primera.texto).toContain('- COPIA');
    const impresiones = await prisma.impresionRecibo.findMany({
      where: { operacionId: remesaId },
      orderBy: { creadoEn: 'asc' },
    });
    expect(impresiones.map((i) => i.esCopia)).toEqual([false, true, true]);
    expect(impresiones[2]?.usuarioId).toBe(admin.id);
  });

  it('dos impresiones a la vez: solo una es el original', async () => {
    const { vendedor, remesaId } = await remesaRegistrada();
    const api = nuevaApp();

    const respuestas = await Promise.all(
      Array.from({ length: 4 }, () =>
        llamar(api, 'POST', `/remesas/${remesaId}/recibo`, { token: vendedor.token }),
      ),
    );

    const copias = respuestas.map((r) => reciboDe(r).esCopia);
    expect(copias.filter((esCopia) => !esCopia)).toHaveLength(1);
    expect(respuestas.map((r) => reciboDe(r).numeroCopia).sort()).toEqual([0, 1, 2, 3]);
  });

  it('incluye el mensaje al pie de la empresa', async () => {
    const { vendedor, remesaId } = await remesaRegistrada();
    const empresa = await prisma.empresa.findUniqueOrThrow({ where: { unica: true } });
    await prisma.empresa.update({
      where: { unica: true },
      data: { textoPieRecibo: 'Gracias por confiar en nosotros' },
    });

    const recibo = reciboDe(
      await llamar(nuevaApp(), 'POST', `/remesas/${remesaId}/recibo`, { token: vendedor.token }),
    );
    await prisma.empresa.update({
      where: { unica: true },
      data: { textoPieRecibo: empresa.textoPieRecibo },
    });

    expect(recibo.empresa.textoPie).toBe('Gracias por confiar en nosotros');
    expect(recibo.texto.endsWith('Gracias por confiar en nosotros')).toBe(true);
  });

  it('una remesa anulada no tiene recibo', async () => {
    const { vendedor, admin, remesaId } = await remesaRegistrada();
    const api = nuevaApp();
    await llamar(api, 'POST', `/remesas/${remesaId}/anular`, {
      token: admin.token,
      cuerpo: { motivo: 'Error del vendedor' },
    });

    const respuesta = await llamar(api, 'POST', `/remesas/${remesaId}/recibo`, {
      token: vendedor.token,
    });

    expect(respuesta.statusCode).toBe(409);
    expect(await prisma.impresionRecibo.count({ where: { operacionId: remesaId } })).toBe(0);
  });
});

describe('fecha en la zona de la empresa', () => {
  it('usa la zona indicada, no la del equipo', () => {
    const instante = new Date('2026-10-13T19:05:00Z');

    expect(fechaEnZona(instante, 'America/Bogota')).toBe('13/10/2026 14:05');
    expect(fechaEnZona(instante, 'America/Caracas')).toBe('13/10/2026 15:05');
    expect(fechaEnZona(new Date('2026-10-14T04:30:00Z'), 'America/Bogota')).toBe(
      '13/10/2026 23:30',
    );
  });
});
