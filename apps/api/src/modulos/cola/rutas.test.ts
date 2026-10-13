import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
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
  cuerpoError,
  llamar,
} from '../../../test/auth.js';
import { formularioConArchivos, jpegDePrueba, pngDePrueba } from '../../../test/imagenes.js';
import { crearPrisma, type PrismaClient } from '../../lib/prisma.js';

let prisma: PrismaClient;
let app: FastifyInstance | undefined;
let carpeta: string;

beforeAll(async () => {
  prisma = crearPrisma();
  await asegurarEmpresa(prisma);
  carpeta = await mkdtemp(join(tmpdir(), 'cambios-jc-cola-'));
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
  otroDigitador: Sesion;
  cuentaVesId: string;
  cuentaCopId: string;
  nombreRemitente: string;
  documentoRemitente: string;
  crearRemesa: (api: FastifyInstance) => Promise<{ id: string; montoBolivares: string }>;
}

/** Línea, tasa, cuentas y personas de una prueba; `crearRemesa` deja una remesa en efectivo ya en cola. */
async function escenario(): Promise<Escenario> {
  const [vendedor, admin, digitador, otroDigitador] = await Promise.all([
    sesion('vendedor'),
    sesion('administrador'),
    sesion('digitador'),
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
  const caja = await prisma.cuentaDinero.create({
    data: { nombre: `Caja ${unico()}`, tipo: 'caja', moneda: 'COP', sucursalId: sucursal.id },
  });
  const cuentaVes = await prisma.cuentaDinero.create({
    data: {
      nombre: `Banco VES ${unico()}`,
      tipo: 'billetera',
      moneda: 'VES',
      sucursalId: sucursal.id,
      comisionPorDefecto: '1.500',
    },
  });
  const banco = await prisma.banco.upsert({
    where: { codigo: '9125' },
    update: {},
    create: { codigo: '9125', nombre: 'Banco de prueba de la cola' },
  });
  const sufijo = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 90) + 10);
  const documentoRemitente = `31${sufijo}`;
  const nombreRemitente = `Remitente Reservado ${unico()}`;
  const remitente = await prisma.cliente.create({
    data: {
      tipoDocumento: 'CC',
      numeroDocumento: documentoRemitente,
      nombre: nombreRemitente,
      creadoPorId: vendedor.id,
    },
  });
  const beneficiario = await prisma.cliente.create({
    data: {
      tipoDocumento: 'V',
      numeroDocumento: `41${sufijo}`,
      nombre: 'Beneficiario de la cola',
      creadoPorId: vendedor.id,
    },
  });
  const medio = await prisma.medioPago.create({
    data: {
      clienteId: beneficiario.id,
      tipo: 'cuenta_bancaria',
      bancoId: banco.id,
      numeroCuenta: `9125${sufijo}${'0'.repeat(8)}`,
      titular: 'Titular Visible',
      tipoDocumentoTitular: 'V',
      numeroDocumentoTitular: '87654321',
    },
  });

  return {
    vendedor,
    admin,
    digitador,
    otroDigitador,
    cuentaVesId: cuentaVes.id,
    cuentaCopId: caja.id,
    nombreRemitente,
    documentoRemitente,
    async crearRemesa(api) {
      const respuesta = await llamar(api, 'POST', '/remesas', {
        token: vendedor.token,
        cuerpo: {
          claveIdempotencia: randomUUID(),
          lineaNegocioId: linea.id,
          remitenteId: remitente.id,
          medioPagoId: medio.id,
          formaPago: 'efectivo',
          cuentaIngresoId: caja.id,
          montoPesos: '50000',
        },
      });
      const { remesa } = respuesta.json<{ remesa: { id: string; montoBolivares: string } }>();
      return remesa;
    },
  };
}

interface ItemJson {
  id: string;
  estado: string;
  tomadaPorMi: boolean;
  montoBolivares: string;
  pago: {
    banco: { nombre: string };
    numeroCuenta: string | null;
    titular: string | null;
    numeroDocumentoTitular: string | null;
  };
}

interface ColaJson {
  remesas: ItemJson[];
  cuentasOrigen: { id: string; nombre: string; comisionPorDefecto: string | null }[];
  ultimaCuentaOrigenId: string | null;
}

const colaDe = (respuesta: { json: () => unknown }): ColaJson => respuesta.json() as ColaJson;

function completarConArchivo(
  api: FastifyInstance,
  token: string,
  id: string,
  campos: Record<string, string>,
  archivo: { nombre: string; mime: string; contenido: Buffer } | null = {
    nombre: 'captura.png',
    mime: 'image/png',
    contenido: pngDePrueba(100),
  },
) {
  const formulario = formularioConArchivos([
    ...Object.entries(campos).map(([campo, valor]) => ({ campo, valor })),
    ...(archivo
      ? [
          {
            campo: 'comprobante',
            nombreArchivo: archivo.nombre,
            tipoMime: archivo.mime,
            contenido: archivo.contenido,
          },
        ]
      : []),
  ]);
  return api.inject({
    method: 'POST',
    url: `/cola/${id}/completar`,
    headers: { ...formulario.headers, ...conSesion(token) },
    payload: formulario.payload,
  });
}

describe('acceso a la cola', () => {
  const id = randomUUID();
  const rutas: ['GET' | 'POST', string][] = [
    ['GET', '/cola'],
    ['POST', `/cola/${id}/tomar`],
    ['POST', `/cola/${id}/devolver`],
    ['POST', `/cola/${id}/incidencia`],
    ['POST', `/cola/${id}/completar`],
  ];

  it.each(rutas)('%s %s: sin sesión responde 401', async (metodo, url) => {
    expect((await llamar(nuevaApp(), metodo, url)).statusCode).toBe(401);
  });

  it.each(['vendedor', 'administrador'] as const)(
    'un %s recibe 403: pagar es exclusivo del digitador',
    async (rol) => {
      const { token } = await sesion(rol);
      const api = nuevaApp();

      for (const [metodo, url] of rutas) {
        const respuesta = await llamar(api, metodo, url, { token });
        expect(respuesta.statusCode, `${metodo} ${url}`).toBe(403);
      }
    },
  );
});

describe('lista de la cola', () => {
  it('muestra la más antigua primero y no revela pesos, tasa ni datos del remitente', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const primera = await e.crearRemesa(api);
    const segunda = await e.crearRemesa(api);

    const respuesta = await llamar(api, 'GET', '/cola', { token: e.digitador.token });

    expect(respuesta.statusCode).toBe(200);
    const ids = colaDe(respuesta).remesas.map((r) => r.id);
    expect(ids.indexOf(primera.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(primera.id)).toBeLessThan(ids.indexOf(segunda.id));
    const texto = respuesta.body;
    expect(texto).not.toContain(e.nombreRemitente);
    expect(texto).not.toContain(e.documentoRemitente);
    for (const campo of ['montoPesos', 'tasaUsada', 'tasaCalculada', 'tasaVenta', 'remitente']) {
      expect(texto, campo).not.toContain(campo);
    }
    expect(texto).not.toContain('50000.00');
  });

  it('antes de tomarla solo se ve el banco y el monto; después, a quién pagar', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const remesa = await e.crearRemesa(api);

    const antes = colaDe(await llamar(api, 'GET', '/cola', { token: e.digitador.token }));
    const itemAntes = antes.remesas.find((r) => r.id === remesa.id);
    await llamar(api, 'POST', `/cola/${remesa.id}/tomar`, { token: e.digitador.token });
    const despues = colaDe(await llamar(api, 'GET', '/cola', { token: e.digitador.token }));
    const itemDespues = despues.remesas.find((r) => r.id === remesa.id);
    const deOtro = colaDe(await llamar(api, 'GET', '/cola', { token: e.otroDigitador.token }));

    expect(itemAntes).toMatchObject({
      estado: 'en_cola',
      montoBolivares: '10000.000',
      pago: { banco: { nombre: 'Banco de prueba de la cola' }, numeroCuenta: null, titular: null },
    });
    expect(itemDespues).toMatchObject({
      estado: 'tomada',
      tomadaPorMi: true,
      pago: { titular: 'Titular Visible', numeroDocumentoTitular: '87654321' },
    });
    expect(itemDespues?.pago.numeroCuenta).toMatch(/^9125\d{16}$/);
    // La que tomó otra persona ya no aparece en la cola de los demás.
    expect(deOtro.remesas.map((r) => r.id)).not.toContain(remesa.id);
  });

  it('incluye las cuentas desde las que puede pagar, con la comisión que se propone', async () => {
    const e = await escenario();

    const cola = colaDe(await llamar(nuevaApp(), 'GET', '/cola', { token: e.digitador.token }));

    expect(cola.cuentasOrigen).toContainEqual(
      expect.objectContaining({ id: e.cuentaVesId, comisionPorDefecto: '1.500' }),
    );
    expect(cola.cuentasOrigen.map((c) => c.id)).not.toContain(e.cuentaCopId);
  });
});

describe('tomar, devolver y reportar incidencia', () => {
  it('dos digitadores piden la misma a la vez: una gana y la otra recibe el error', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const remesa = await e.crearRemesa(api);

    const [a, b] = await Promise.all([
      llamar(api, 'POST', `/cola/${remesa.id}/tomar`, { token: e.digitador.token }),
      llamar(api, 'POST', `/cola/${remesa.id}/tomar`, { token: e.otroDigitador.token }),
    ]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const transferencia = await prisma.transferencia.findUnique({
      where: { operacionId: remesa.id },
    });
    const ganador = a.statusCode === 200 ? e.digitador.id : e.otroDigitador.id;
    expect(transferencia?.operadorId).toBe(ganador);
  });

  it('el vendedor ve que quedó tomada y por quién', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const remesa = await e.crearRemesa(api);
    await llamar(api, 'POST', `/cola/${remesa.id}/tomar`, { token: e.digitador.token });

    const respuesta = await llamar(api, 'GET', `/remesas/${remesa.id}`, {
      token: e.vendedor.token,
    });

    const { remesa: detalle } = respuesta.json<{
      remesa: { estado: string; pago: { operador: { id: string } | null } };
    }>();
    expect(detalle.estado).toBe('tomada');
    expect(detalle.pago.operador?.id).toBe(e.digitador.id);
  });

  it('quien la tomó puede devolverla; otra persona no', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const remesa = await e.crearRemesa(api);
    await llamar(api, 'POST', `/cola/${remesa.id}/tomar`, { token: e.digitador.token });

    const ajeno = await llamar(api, 'POST', `/cola/${remesa.id}/devolver`, {
      token: e.otroDigitador.token,
    });
    const propio = await llamar(api, 'POST', `/cola/${remesa.id}/devolver`, {
      token: e.digitador.token,
    });
    const transferencia = await prisma.transferencia.findUnique({
      where: { operacionId: remesa.id },
    });

    expect(ajeno.statusCode).toBe(409);
    expect(propio.statusCode).toBe(200);
    expect(transferencia?.operadorId).toBeNull();
    const cola = colaDe(await llamar(api, 'GET', '/cola', { token: e.otroDigitador.token }));
    expect(cola.remesas.map((r) => r.id)).toContain(remesa.id);
  });

  it('una incidencia exige motivo y deja la remesa para que el vendedor la corrija', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const remesa = await e.crearRemesa(api);
    await llamar(api, 'POST', `/cola/${remesa.id}/tomar`, { token: e.digitador.token });

    const sinMotivo = await llamar(api, 'POST', `/cola/${remesa.id}/incidencia`, {
      token: e.digitador.token,
      cuerpo: { motivo: '' },
    });
    const ajeno = await llamar(api, 'POST', `/cola/${remesa.id}/incidencia`, {
      token: e.otroDigitador.token,
      cuerpo: { motivo: 'La cuenta no existe' },
    });
    const bueno = await llamar(api, 'POST', `/cola/${remesa.id}/incidencia`, {
      token: e.digitador.token,
      cuerpo: { motivo: 'La cuenta no existe' },
    });

    expect(sinMotivo.statusCode).toBe(400);
    expect(ajeno.statusCode).toBe(409);
    expect(bueno.statusCode).toBe(200);
    const evento = await prisma.eventoOperacion.findFirst({
      where: { operacionId: remesa.id, estadoNuevo: 'con_incidencia' },
    });
    expect(evento).toMatchObject({ motivo: 'La cuenta no existe', usuarioId: e.digitador.id });
  });

  it('no se toma una remesa anulada, ni una que ya no está en la cola', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const remesa = await e.crearRemesa(api);
    await llamar(api, 'POST', `/remesas/${remesa.id}/anular`, {
      token: e.admin.token,
      cuerpo: { motivo: 'Error del vendedor' },
    });

    const respuesta = await llamar(api, 'POST', `/cola/${remesa.id}/tomar`, {
      token: e.digitador.token,
    });
    const noExiste = await llamar(api, 'POST', `/cola/${randomUUID()}/tomar`, {
      token: e.digitador.token,
    });

    expect(respuesta.statusCode).toBe(409);
    expect(noExiste.statusCode).toBe(404);
  });
});

describe('completar la transferencia', () => {
  it('guarda la captura y los datos, y el vendedor puede ver el comprobante', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const remesa = await e.crearRemesa(api);
    await llamar(api, 'POST', `/cola/${remesa.id}/tomar`, { token: e.digitador.token });

    const respuesta = await completarConArchivo(api, e.digitador.token, remesa.id, {
      cuentaOrigenId: e.cuentaVesId,
      referenciaBancaria: `REF${unico()}`,
      costoBancario: '2.250',
    });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toEqual({ remesa: { id: remesa.id, estado: 'completada' } });
    const detalle = (
      await llamar(api, 'GET', `/remesas/${remesa.id}`, { token: e.vendedor.token })
    ).json<{
      remesa: {
        estado: string;
        pago: {
          cuentaOrigen: { id: string };
          costoBancario: string;
          tieneComprobante: boolean;
          completadaEn: string;
        };
      };
    }>().remesa;
    expect(detalle.estado).toBe('completada');
    expect(detalle.pago).toMatchObject({
      cuentaOrigen: { id: e.cuentaVesId },
      costoBancario: '2.250',
      tieneComprobante: true,
    });

    const imagen = await llamar(api, 'GET', `/remesas/${remesa.id}/comprobante`, {
      token: e.vendedor.token,
    });
    expect(imagen.statusCode).toBe(200);
    expect(imagen.headers['content-type']).toBe('image/png');
    expect(imagen.rawPayload.subarray(0, 4)).toEqual(pngDePrueba().subarray(0, 4));
  });

  it('sin costo ni referencia usa la comisión de la cuenta y deja la referencia vacía', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const remesa = await e.crearRemesa(api);
    await llamar(api, 'POST', `/cola/${remesa.id}/tomar`, { token: e.digitador.token });

    const respuesta = await completarConArchivo(
      api,
      e.digitador.token,
      remesa.id,
      { cuentaOrigenId: e.cuentaVesId },
      { nombre: 'foto.jpg', mime: 'image/jpeg', contenido: jpegDePrueba(80) },
    );

    expect(respuesta.statusCode).toBe(200);
    const transferencia = await prisma.transferencia.findUnique({
      where: { operacionId: remesa.id },
    });
    expect(transferencia?.costoBancario?.toFixed(3)).toBe('1.500');
    expect(transferencia?.referenciaBancaria).toBeNull();
    expect(transferencia?.comprobanteClave).toMatch(/^comprobantes\/[0-9a-f]{32}\.jpg$/);
  });

  it('propone como cuenta la última que usó esa persona', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const remesa = await e.crearRemesa(api);
    await llamar(api, 'POST', `/cola/${remesa.id}/tomar`, { token: e.digitador.token });
    await completarConArchivo(api, e.digitador.token, remesa.id, { cuentaOrigenId: e.cuentaVesId });

    const cola = colaDe(await llamar(api, 'GET', '/cola', { token: e.digitador.token }));

    expect(cola.ultimaCuentaOrigenId).toBe(e.cuentaVesId);
  });

  it.each([
    ['sin captura', null],
    [
      'con un archivo que no es imagen',
      { nombre: 'captura.png', mime: 'image/png', contenido: Buffer.from('<svg></svg>') },
    ],
  ])('rechaza %s y la remesa sigue tomada', async (_nombre, archivo) => {
    const e = await escenario();
    const api = nuevaApp();
    const remesa = await e.crearRemesa(api);
    await llamar(api, 'POST', `/cola/${remesa.id}/tomar`, { token: e.digitador.token });

    const respuesta = await completarConArchivo(
      api,
      e.digitador.token,
      remesa.id,
      { cuentaOrigenId: e.cuentaVesId },
      archivo,
    );

    expect(respuesta.statusCode).toBe(400);
    const operacion = await prisma.operacion.findUnique({ where: { id: remesa.id } });
    expect(operacion?.estado).toBe('tomada');
  });

  it('rechaza una cuenta en otra moneda, o sin elegir cuenta', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const remesa = await e.crearRemesa(api);
    await llamar(api, 'POST', `/cola/${remesa.id}/tomar`, { token: e.digitador.token });

    const enPesos = await completarConArchivo(api, e.digitador.token, remesa.id, {
      cuentaOrigenId: e.cuentaCopId,
    });
    const sinCuenta = await completarConArchivo(api, e.digitador.token, remesa.id, {});

    expect(enPesos.statusCode).toBe(409);
    expect(sinCuenta.statusCode).toBe(400);
  });

  it('una misma referencia no se usa dos veces en la misma cuenta, y no deja archivos sueltos', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const primera = await e.crearRemesa(api);
    const segunda = await e.crearRemesa(api);
    const referenciaBancaria = `DUP${unico()}`;
    await llamar(api, 'POST', `/cola/${primera.id}/tomar`, { token: e.digitador.token });
    await llamar(api, 'POST', `/cola/${segunda.id}/tomar`, { token: e.digitador.token });
    await completarConArchivo(api, e.digitador.token, primera.id, {
      cuentaOrigenId: e.cuentaVesId,
      referenciaBancaria,
    });
    const archivosAntes = await readdir(join(carpeta, 'comprobantes'));

    const repetida = await completarConArchivo(api, e.digitador.token, segunda.id, {
      cuentaOrigenId: e.cuentaVesId,
      referenciaBancaria,
    });

    expect(repetida.statusCode).toBe(409);
    expect(cuerpoError(repetida).codigo).toBe('VALOR_EN_USO');
    expect(await readdir(join(carpeta, 'comprobantes'))).toEqual(archivosAntes);
    const operacion = await prisma.operacion.findUnique({ where: { id: segunda.id } });
    expect(operacion?.estado).toBe('tomada');
  });

  it('solo la completa quien la tomó, y una vez', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const remesa = await e.crearRemesa(api);
    await llamar(api, 'POST', `/cola/${remesa.id}/tomar`, { token: e.digitador.token });
    const campos = { cuentaOrigenId: e.cuentaVesId };

    const ajeno = await completarConArchivo(api, e.otroDigitador.token, remesa.id, campos);
    const propio = await completarConArchivo(api, e.digitador.token, remesa.id, campos);
    const repetido = await completarConArchivo(api, e.digitador.token, remesa.id, campos);

    expect(ajeno.statusCode).toBe(409);
    expect(propio.statusCode).toBe(200);
    expect(repetido.statusCode).toBe(409);
  });

  it('el digitador no puede abrir comprobantes por la ruta del vendedor', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const remesa = await e.crearRemesa(api);

    const respuesta = await llamar(api, 'GET', `/remesas/${remesa.id}/comprobante`, {
      token: e.digitador.token,
    });
    const sinComprobante = await llamar(api, 'GET', `/remesas/${remesa.id}/comprobante`, {
      token: e.vendedor.token,
    });

    expect(respuesta.statusCode).toBe(403);
    expect(sinComprobante.statusCode).toBe(404);
  });
});

describe('liberar una remesa tomada (administrador)', () => {
  it('vuelve a la cola sin operador; el vendedor y el digitador no pueden', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const remesa = await e.crearRemesa(api);
    await llamar(api, 'POST', `/cola/${remesa.id}/tomar`, { token: e.digitador.token });

    const vendedor = await llamar(api, 'POST', `/remesas/${remesa.id}/liberar`, {
      token: e.vendedor.token,
    });
    const digitador = await llamar(api, 'POST', `/remesas/${remesa.id}/liberar`, {
      token: e.digitador.token,
    });
    const admin = await llamar(api, 'POST', `/remesas/${remesa.id}/liberar`, {
      token: e.admin.token,
    });
    const otraVez = await llamar(api, 'POST', `/remesas/${remesa.id}/liberar`, {
      token: e.admin.token,
    });

    expect(vendedor.statusCode).toBe(403);
    expect(digitador.statusCode).toBe(403);
    expect(admin.statusCode).toBe(200);
    expect(otraVez.statusCode).toBe(409);
    const transferencia = await prisma.transferencia.findUnique({
      where: { operacionId: remesa.id },
    });
    expect(transferencia?.operadorId).toBeNull();
    const cola = colaDe(await llamar(api, 'GET', '/cola', { token: e.otroDigitador.token }));
    expect(cola.remesas.map((r) => r.id)).toContain(remesa.id);
  });
});
