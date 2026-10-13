import { randomUUID } from 'node:crypto';

import { Decimal } from '@cambios-jc/shared';
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

import { calcularMontos } from './servicio.js';

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

interface Escenario {
  lineaId: string;
  tasaId: string;
  remitenteId: string;
  medioPagoId: string;
  cajaId: string;
  bancoCuentaId: string;
  vendedor: { id: string; token: string };
  admin: { id: string; token: string };
}

/** Todo lo que una remesa necesita, con una línea nueva por prueba para que su tasa sea solo suya. */
async function escenario(tasaVenta = '5.190000'): Promise<Escenario> {
  const admin = await crearUsuarioDePrueba(prisma, { rol: 'administrador' });
  const vendedor = await crearUsuarioDePrueba(prisma, { rol: 'vendedor' });
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
  const tasa = await prisma.tasa.create({
    data: { lineaNegocioId: linea.id, tasaVenta, publicadaPorId: admin.id },
  });
  const caja = await prisma.cuentaDinero.create({
    data: { nombre: `Caja ${unico()}`, tipo: 'caja', moneda: 'COP', sucursalId: sucursal.id },
  });
  const bancoCuenta = await prisma.cuentaDinero.create({
    data: { nombre: `Banco ${unico()}`, tipo: 'billetera', moneda: 'COP', sucursalId: sucursal.id },
  });
  const banco = await prisma.banco.upsert({
    where: { codigo: '9124' },
    update: {},
    create: { codigo: '9124', nombre: 'Banco de prueba de remesas' },
  });
  const numero = String(50_000_000 + Math.floor(Math.random() * 40_000_000));
  const remitente = await prisma.cliente.create({
    data: {
      tipoDocumento: 'CC',
      numeroDocumento: `${numero}${unico().slice(0, 2).replace(/\D/g, '1')}`,
      nombre: 'Remitente de prueba',
      creadoPorId: vendedor.id,
    },
  });
  const beneficiario = await prisma.cliente.create({
    data: {
      tipoDocumento: 'V',
      numeroDocumento: `${numero.slice(1)}${unico().slice(0, 2).replace(/\D/g, '2')}`,
      nombre: 'Beneficiario de prueba',
      creadoPorId: vendedor.id,
    },
  });
  const medio = await prisma.medioPago.create({
    data: {
      clienteId: beneficiario.id,
      tipo: 'cuenta_bancaria',
      bancoId: banco.id,
      numeroCuenta: `9124${String(Date.now()).slice(-16).padStart(16, '0')}`,
      titular: 'Beneficiario de prueba',
      tipoDocumentoTitular: 'V',
      numeroDocumentoTitular: '12345678',
    },
  });
  return {
    lineaId: linea.id,
    tasaId: tasa.id,
    remitenteId: remitente.id,
    medioPagoId: medio.id,
    cajaId: caja.id,
    bancoCuentaId: bancoCuenta.id,
    vendedor: { id: vendedor.id, token: await abrirSesion(prisma, vendedor.id) },
    admin: { id: admin.id, token: await abrirSesion(prisma, admin.id) },
  };
}

const cuerpoBase = (e: Escenario, extra: Record<string, unknown> = {}) => ({
  claveIdempotencia: randomUUID(),
  lineaNegocioId: e.lineaId,
  remitenteId: e.remitenteId,
  medioPagoId: e.medioPagoId,
  formaPago: 'efectivo',
  cuentaIngresoId: e.cajaId,
  montoPesos: '162000',
  ...extra,
});

interface RemesaJson {
  id: string;
  numeroComprobante: number;
  estado: string;
  montoPesos: string;
  montoBolivares: string;
  tasaCalculada: string;
  tasaUsada: string;
  motivoTasa: string | null;
}

const remesaDe = (respuesta: { json: () => unknown }): RemesaJson =>
  (respuesta.json() as { remesa: RemesaJson }).remesa;

describe('acceso a la API de remesas', () => {
  const id = randomUUID();
  const rutas: ['GET' | 'POST', string][] = [
    ['POST', '/remesas'],
    ['GET', '/remesas'],
    ['GET', `/remesas/${id}`],
  ];

  it.each(rutas)('%s %s: sin sesión responde 401', async (metodo, url) => {
    expect((await llamar(nuevaApp(), metodo, url)).statusCode).toBe(401);
  });

  it('el digitador recibe 403: nunca ve montos en pesos ni datos del remitente', async () => {
    const digitador = await crearUsuarioDePrueba(prisma, { rol: 'digitador' });
    const token = await abrirSesion(prisma, digitador.id);
    const api = nuevaApp();

    for (const [metodo, url] of rutas) {
      const respuesta = await llamar(api, metodo, url, { token });
      expect(respuesta.statusCode, `${metodo} ${url}`).toBe(403);
      expect(cuerpoError(respuesta).codigo).toBe('SIN_PERMISO');
    }
  });
});

describe('cálculo de montos', () => {
  it('pesos ÷ tasa, truncado a 3 decimales (162000 ÷ 3,76 = 43085,106)', () => {
    expect(calcularMontos({ montoPesos: '162000' }, new Decimal('3.76'))).toEqual({
      pesos: '162000.00',
      bolivares: '43085.106',
    });
  });

  it('trunca y no redondea hacia arriba (100000 ÷ 3 = 33333,333)', () => {
    expect(calcularMontos({ montoPesos: '100000' }, new Decimal('3')).bolivares).toBe('33333.333');
    expect(calcularMontos({ montoPesos: '200000' }, new Decimal('3')).bolivares).toBe('66666.666');
  });

  it('a la inversa: bolívares × tasa, en pesos con 2 decimales (99,999 → 100,00)', () => {
    expect(calcularMontos({ montoBolivares: '1000' }, new Decimal('5.19'))).toEqual({
      pesos: '5190.00',
      bolivares: '1000.000',
    });
    expect(calcularMontos({ montoBolivares: '33.333' }, new Decimal('3')).pesos).toBe('100.00');
  });

  it('un monto tan pequeño que da 0 bolívares se rechaza', () => {
    expect(() => calcularMontos({ montoPesos: '0.01' }, new Decimal('5000'))).toThrow();
  });

  it('montos grandes conservan todos los decimales', () => {
    expect(
      calcularMontos({ montoPesos: '9999999999999.99' }, new Decimal('3.333333')).bolivares,
    ).toBe('3000000300000.027');
  });
});

describe('registrar remesa', () => {
  it('en efectivo queda en cola, con la tasa vigente congelada y el número 1+', async () => {
    const e = await escenario('5.190000');

    const respuesta = await llamar(nuevaApp(), 'POST', '/remesas', {
      token: e.vendedor.token,
      cuerpo: cuerpoBase(e),
    });

    expect(respuesta.statusCode).toBe(201);
    const remesa = remesaDe(respuesta);
    expect(remesa).toMatchObject({
      estado: 'en_cola',
      montoPesos: '162000.00',
      montoBolivares: '31213.872',
      tasaCalculada: '5.190000',
      tasaUsada: '5.190000',
      motivoTasa: null,
    });
    expect(remesa.numeroComprobante).toBeGreaterThanOrEqual(1);
    const eventos = await prisma.eventoOperacion.findMany({
      where: { operacionId: remesa.id },
      orderBy: { creadoEn: 'asc' },
      select: { estadoAnterior: true, estadoNuevo: true },
    });
    expect(eventos.map((ev) => ev.estadoNuevo)).toEqual([
      'registrada',
      'pago_verificado',
      'en_cola',
    ]);
  });

  it('por transferencia queda registrada, esperando que el vendedor verifique el pago', async () => {
    const e = await escenario();

    const respuesta = await llamar(nuevaApp(), 'POST', '/remesas', {
      token: e.vendedor.token,
      cuerpo: cuerpoBase(e, { formaPago: 'transferencia', cuentaIngresoId: e.bancoCuentaId }),
    });

    expect(respuesta.statusCode).toBe(201);
    expect(remesaDe(respuesta).estado).toBe('registrada');
  });

  it('un reintento con la misma clave devuelve la misma remesa y no crea otra', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const cuerpo = cuerpoBase(e);

    const primera = await llamar(api, 'POST', '/remesas', { token: e.vendedor.token, cuerpo });
    const segunda = await llamar(api, 'POST', '/remesas', { token: e.vendedor.token, cuerpo });

    expect(primera.statusCode).toBe(201);
    expect(segunda.statusCode).toBe(200);
    expect(remesaDe(segunda).id).toBe(remesaDe(primera).id);
    expect(
      await prisma.operacion.count({ where: { claveIdempotencia: cuerpo.claveIdempotencia } }),
    ).toBe(1);
  });

  it('dos peticiones simultáneas con la misma clave crean una sola remesa', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const cuerpo = cuerpoBase(e);

    const [a, b] = await Promise.all([
      llamar(api, 'POST', '/remesas', { token: e.vendedor.token, cuerpo }),
      llamar(api, 'POST', '/remesas', { token: e.vendedor.token, cuerpo }),
    ]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(remesaDe(a).id).toBe(remesaDe(b).id);
  });

  it('otra persona no puede reutilizar la clave de idempotencia de alguien más', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const cuerpo = cuerpoBase(e);
    await llamar(api, 'POST', '/remesas', { token: e.vendedor.token, cuerpo });

    const respuesta = await llamar(api, 'POST', '/remesas', { token: e.admin.token, cuerpo });

    expect(respuesta.statusCode).toBe(409);
  });

  it('los números de comprobante son consecutivos aunque lleguen en paralelo', async () => {
    const e = await escenario();
    const api = nuevaApp();

    const respuestas = await Promise.all(
      Array.from({ length: 5 }, () =>
        llamar(api, 'POST', '/remesas', { token: e.vendedor.token, cuerpo: cuerpoBase(e) }),
      ),
    );

    const numeros = respuestas.map((r) => remesaDe(r).numeroComprobante).sort((x, y) => x - y);
    expect(new Set(numeros).size).toBe(5);
    expect(Math.max(...numeros) - Math.min(...numeros)).toBe(4);
  });

  it('publicar otra tasa después no cambia una remesa ya registrada', async () => {
    const e = await escenario('5.000000');
    const api = nuevaApp();
    const creada = remesaDe(
      await llamar(api, 'POST', '/remesas', { token: e.vendedor.token, cuerpo: cuerpoBase(e) }),
    );

    await prisma.tasa.update({ where: { id: e.tasaId }, data: { vigenteHasta: new Date() } });
    await prisma.tasa.create({
      data: { lineaNegocioId: e.lineaId, tasaVenta: '9.000000', publicadaPorId: e.admin.id },
    });
    const releida = remesaDe(
      await llamar(api, 'GET', `/remesas/${creada.id}`, { token: e.vendedor.token }),
    );
    const nueva = remesaDe(
      await llamar(api, 'POST', '/remesas', { token: e.vendedor.token, cuerpo: cuerpoBase(e) }),
    );

    expect(releida).toMatchObject({ tasaUsada: '5.000000', montoBolivares: '32400.000' });
    expect(nueva).toMatchObject({ tasaUsada: '9.000000', montoBolivares: '18000.000' });
  });

  it('el vendedor no puede imponer su propia tasa; el administrador sí, con motivo', async () => {
    const e = await escenario('5.190000');
    const api = nuevaApp();
    const tasaManual = { tasa: '5.000000', motivo: 'Cliente frecuente' };

    const vendedor = await llamar(api, 'POST', '/remesas', {
      token: e.vendedor.token,
      cuerpo: cuerpoBase(e, { tasaManual }),
    });
    const sinMotivo = await llamar(api, 'POST', '/remesas', {
      token: e.admin.token,
      cuerpo: cuerpoBase(e, { tasaManual: { tasa: '5.000000', motivo: '' } }),
    });
    const admin = await llamar(api, 'POST', '/remesas', {
      token: e.admin.token,
      cuerpo: cuerpoBase(e, { tasaManual }),
    });

    expect(vendedor.statusCode).toBe(403);
    expect(sinMotivo.statusCode).toBe(400);
    expect(admin.statusCode).toBe(201);
    expect(remesaDe(admin)).toMatchObject({
      tasaCalculada: '5.190000',
      tasaUsada: '5.000000',
      motivoTasa: 'Cliente frecuente',
      montoBolivares: '32400.000',
    });
  });

  it('acepta los bolívares en lugar de los pesos', async () => {
    const e = await escenario('5.000000');

    const respuesta = await llamar(nuevaApp(), 'POST', '/remesas', {
      token: e.vendedor.token,
      cuerpo: cuerpoBase(e, { montoPesos: undefined, montoBolivares: '1000' }),
    });

    expect(respuesta.statusCode).toBe(201);
    expect(remesaDe(respuesta)).toMatchObject({
      montoPesos: '5000.00',
      montoBolivares: '1000.000',
    });
  });

  it.each([
    ['ninguno de los dos montos', { montoPesos: undefined }],
    ['los dos montos a la vez', { montoBolivares: '10' }],
    ['un monto en cero', { montoPesos: '0' }],
    ['un monto con coma', { montoPesos: '162.000,50' }],
    ['demasiados decimales en pesos', { montoPesos: '10.123' }],
  ])('rechaza %s', async (_nombre, extra) => {
    const e = await escenario();

    const respuesta = await llamar(nuevaApp(), 'POST', '/remesas', {
      token: e.vendedor.token,
      cuerpo: cuerpoBase(e, extra),
    });

    expect(respuesta.statusCode).toBe(400);
  });

  it('rechaza si no hay tasa vigente para la línea', async () => {
    const e = await escenario();
    await prisma.tasa.update({ where: { id: e.tasaId }, data: { vigenteHasta: new Date() } });

    const respuesta = await llamar(nuevaApp(), 'POST', '/remesas', {
      token: e.vendedor.token,
      cuerpo: cuerpoBase(e),
    });

    expect(respuesta.statusCode).toBe(409);
    expect(cuerpoError(respuesta).mensaje).toContain('tasa vigente');
  });

  it('efectivo no puede entrar a una cuenta bancaria, ni una transferencia a una caja', async () => {
    const e = await escenario();
    const api = nuevaApp();

    const efectivoABanco = await llamar(api, 'POST', '/remesas', {
      token: e.vendedor.token,
      cuerpo: cuerpoBase(e, { cuentaIngresoId: e.bancoCuentaId }),
    });
    const transferenciaACaja = await llamar(api, 'POST', '/remesas', {
      token: e.vendedor.token,
      cuerpo: cuerpoBase(e, { formaPago: 'transferencia' }),
    });

    expect(efectivoABanco.statusCode).toBe(409);
    expect(transferenciaACaja.statusCode).toBe(409);
  });

  it('rechaza un cliente, un medio de pago o una línea desactivados', async () => {
    const e = await escenario();
    const api = nuevaApp();

    await prisma.medioPago.update({ where: { id: e.medioPagoId }, data: { activo: false } });
    const medio = await llamar(api, 'POST', '/remesas', {
      token: e.vendedor.token,
      cuerpo: cuerpoBase(e),
    });
    await prisma.medioPago.update({ where: { id: e.medioPagoId }, data: { activo: true } });
    await prisma.cliente.update({ where: { id: e.remitenteId }, data: { activo: false } });
    const remitente = await llamar(api, 'POST', '/remesas', {
      token: e.vendedor.token,
      cuerpo: cuerpoBase(e),
    });
    await prisma.cliente.update({ where: { id: e.remitenteId }, data: { activo: true } });
    await prisma.lineaNegocio.update({ where: { id: e.lineaId }, data: { activa: false } });
    const linea = await llamar(api, 'POST', '/remesas', {
      token: e.vendedor.token,
      cuerpo: cuerpoBase(e),
    });

    for (const respuesta of [medio, remitente, linea]) {
      expect(respuesta.statusCode).toBe(409);
      expect(cuerpoError(respuesta).codigo).toBe('ESTADO_INVALIDO');
    }
  });

  it('queda en la bitácora sin datos personales', async () => {
    const e = await escenario();
    const remesa = remesaDe(
      await llamar(nuevaApp(), 'POST', '/remesas', {
        token: e.vendedor.token,
        cuerpo: cuerpoBase(e),
      }),
    );

    const registro = await prisma.auditoria.findFirst({
      where: { accion: 'remesa.registrar', entidadId: remesa.id },
    });

    expect(registro?.usuarioId).toBe(e.vendedor.id);
    const texto = JSON.stringify(registro?.despues);
    expect(texto).toContain('montoBolivares');
    expect(texto).not.toContain('Beneficiario de prueba');
    expect(texto).not.toContain('12345678');
  });
});

describe('consultar remesas', () => {
  it('el vendedor lista y filtra por estado, y ve las de todos', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const delAdmin = remesaDe(
      await llamar(api, 'POST', '/remesas', { token: e.admin.token, cuerpo: cuerpoBase(e) }),
    );
    const porRegistrar = remesaDe(
      await llamar(api, 'POST', '/remesas', {
        token: e.vendedor.token,
        cuerpo: cuerpoBase(e, { formaPago: 'transferencia', cuentaIngresoId: e.bancoCuentaId }),
      }),
    );

    const todas = await llamar(api, 'GET', '/remesas', { token: e.vendedor.token });
    const registradas = await llamar(api, 'GET', '/remesas?estado=registrada', {
      token: e.vendedor.token,
    });

    const ids = (r: { json: () => unknown }): string[] =>
      (r.json() as { remesas: RemesaJson[] }).remesas.map((x) => x.id);
    expect(ids(todas)).toEqual(expect.arrayContaining([delAdmin.id, porRegistrar.id]));
    expect(ids(registradas)).toContain(porRegistrar.id);
    expect(ids(registradas)).not.toContain(delAdmin.id);
  });

  it('una remesa que no existe responde 404', async () => {
    const e = await escenario();

    const respuesta = await llamar(nuevaApp(), 'GET', `/remesas/${randomUUID()}`, {
      token: e.vendedor.token,
    });

    expect(respuesta.statusCode).toBe(404);
  });
});
