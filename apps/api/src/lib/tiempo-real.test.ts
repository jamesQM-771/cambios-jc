import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import { EVENTOS_TIEMPO_REAL } from '@cambios-jc/shared';
import type { FastifyInstance } from 'fastify';
import { io as conectar, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { cerrarApp, crearAppPrueba } from '../../test/ayudas.js';
import { abrirSesion, asegurarEmpresa, crearUsuarioDePrueba, llamar } from '../../test/auth.js';
import { abrirTurnoDePrueba } from '../../test/turnos.js';

import { crearPrisma, type PrismaClient } from './prisma.js';
import { leerCookie } from './tiempo-real.js';

let prisma: PrismaClient;
let app: FastifyInstance | undefined;
const sockets: Socket[] = [];

beforeAll(async () => {
  prisma = crearPrisma();
  await asegurarEmpresa(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await cerrarApp(app);
  app = undefined;
});

const unico = () => randomUUID().slice(0, 8);

async function arrancar(): Promise<{ api: FastifyInstance; url: string }> {
  const api = crearAppPrueba({ sesionReal: true, prisma: crearPrisma() });
  app = api;
  await api.listen({ port: 0, host: '127.0.0.1' });
  const { port } = api.server.address() as AddressInfo;
  return { api, url: `http://127.0.0.1:${String(port)}` };
}

async function sesion(rol: 'administrador' | 'vendedor' | 'digitador') {
  const usuario = await crearUsuarioDePrueba(prisma, { rol });
  return { id: usuario.id, token: await abrirSesion(prisma, usuario.id) };
}

/** Conecta con la cookie de sesión y espera a estar dentro (o a que lo rechacen). */
function conectarComo(url: string, token: string | undefined): Promise<Socket> {
  const socket = conectar(url, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: token ? { cookie: `cambios_sesion=${token}` } : {},
  });
  sockets.push(socket);
  return new Promise((resolver, rechazar) => {
    socket.once('connect', () => {
      resolver(socket);
    });
    socket.once('connect_error', (error) => {
      rechazar(error);
    });
  });
}

/** Junta lo que llegue por un evento durante la prueba. */
function escuchar<T = unknown>(socket: Socket, evento: string): T[] {
  const recibidos: T[] = [];
  socket.on(evento, (dato: T) => {
    recibidos.push(dato);
  });
  return recibidos;
}

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

async function esperarHasta(condicion: () => boolean, ms = 3000): Promise<void> {
  const limite = Date.now() + ms;
  while (!condicion() && Date.now() < limite) await esperar(25);
}

/** Línea, tasa, cuentas y personas para registrar una remesa en efectivo por la API. */
async function prepararRemesa(vendedorId: string, adminId: string) {
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
    data: { lineaNegocioId: linea.id, tasaVenta: '5.000000', publicadaPorId: adminId },
  });
  const caja = await prisma.cuentaDinero.create({
    data: { nombre: `Caja ${unico()}`, tipo: 'caja', moneda: 'COP', sucursalId: sucursal.id },
  });
  await abrirTurnoDePrueba(prisma, { usuarioId: vendedorId, cuentaCajaId: caja.id });
  const banco = await prisma.banco.upsert({
    where: { codigo: '9126' },
    update: {},
    create: { codigo: '9126', nombre: 'Banco de prueba del tiempo real' },
  });
  const sufijo = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 90) + 10);
  const remitente = await prisma.cliente.create({
    data: {
      tipoDocumento: 'CC',
      numeroDocumento: `32${sufijo}`,
      nombre: 'Remitente del tiempo real',
      creadoPorId: vendedorId,
    },
  });
  const beneficiario = await prisma.cliente.create({
    data: {
      tipoDocumento: 'V',
      numeroDocumento: `42${sufijo}`,
      nombre: 'Beneficiario del tiempo real',
      creadoPorId: vendedorId,
    },
  });
  const medio = await prisma.medioPago.create({
    data: {
      clienteId: beneficiario.id,
      tipo: 'cuenta_bancaria',
      bancoId: banco.id,
      numeroCuenta: `9126${sufijo}${'0'.repeat(8)}`,
      titular: 'Titular del tiempo real',
      tipoDocumentoTitular: 'V',
      numeroDocumentoTitular: '11223344',
    },
  });
  return {
    claveIdempotencia: randomUUID(),
    lineaNegocioId: linea.id,
    remitenteId: remitente.id,
    medioPagoId: medio.id,
    formaPago: 'efectivo',
    cuentaIngresoId: caja.id,
    montoPesos: '50000',
  };
}

describe('conexión', () => {
  it('rechaza a quien no tiene sesión', async () => {
    const { url } = await arrancar();

    await expect(conectarComo(url, undefined)).rejects.toThrow('NO_AUTENTICADO');
    await expect(conectarComo(url, 'token-que-no-existe')).rejects.toThrow('NO_AUTENTICADO');
  });

  it('acepta a quien tiene una sesión completa', async () => {
    const { url } = await arrancar();
    const { token } = await sesion('vendedor');

    const socket = await conectarComo(url, token);

    expect(socket.connected).toBe(true);
  });
});

describe('avisos de remesas', () => {
  it('el vendedor ve cada cambio de estado y el digitador solo recibe "la cola cambió"', async () => {
    const { api, url } = await arrancar();
    const [vendedor, admin, digitador] = await Promise.all([
      sesion('vendedor'),
      sesion('administrador'),
      sesion('digitador'),
    ]);
    const cuerpo = await prepararRemesa(vendedor.id, admin.id);
    const socketVendedor = await conectarComo(url, vendedor.token);
    const socketDigitador = await conectarComo(url, digitador.token);
    const alVendedor = escuchar<{ id: string; estado: string }>(
      socketVendedor,
      EVENTOS_TIEMPO_REAL.remesaCambio,
    );
    const colaVendedor = escuchar(socketVendedor, EVENTOS_TIEMPO_REAL.colaCambio);
    const alDigitador = escuchar(socketDigitador, EVENTOS_TIEMPO_REAL.colaCambio);
    const remesaAlDigitador = escuchar(socketDigitador, EVENTOS_TIEMPO_REAL.remesaCambio);

    const creada = await llamar(api, 'POST', '/remesas', { token: vendedor.token, cuerpo });
    const { id } = creada.json<{ remesa: { id: string } }>().remesa;
    await llamar(api, 'POST', `/cola/${id}/tomar`, { token: digitador.token });
    await esperarHasta(() => alVendedor.length >= 2 && alDigitador.length >= 2);

    expect(alVendedor).toEqual([
      { id, estado: 'en_cola' },
      { id, estado: 'tomada' },
    ]);
    // El digitador solo se entera de que la cola cambió, sin ningún dato de la remesa.
    expect(alDigitador).toHaveLength(2);
    expect(alDigitador.every((dato) => dato === undefined)).toBe(true);
    // Y nadie recibe los avisos de la otra sala.
    expect(remesaAlDigitador).toEqual([]);
    expect(colaVendedor).toEqual([]);
  });

  it('el administrador también recibe los cambios de remesas', async () => {
    const { api, url } = await arrancar();
    const [vendedor, admin] = await Promise.all([sesion('vendedor'), sesion('administrador')]);
    const cuerpo = await prepararRemesa(vendedor.id, admin.id);
    const alAdmin = escuchar<{ estado: string }>(
      await conectarComo(url, admin.token),
      EVENTOS_TIEMPO_REAL.remesaCambio,
    );

    await llamar(api, 'POST', '/remesas', { token: vendedor.token, cuerpo });
    await esperarHasta(() => alAdmin.length >= 1);

    expect(alAdmin.map((c) => c.estado)).toEqual(['en_cola']);
  });

  it('un reintento con la misma clave no vuelve a avisar', async () => {
    const { api, url } = await arrancar();
    const [vendedor, admin] = await Promise.all([sesion('vendedor'), sesion('administrador')]);
    const cuerpo = await prepararRemesa(vendedor.id, admin.id);
    const recibidos = escuchar(
      await conectarComo(url, vendedor.token),
      EVENTOS_TIEMPO_REAL.remesaCambio,
    );

    await llamar(api, 'POST', '/remesas', { token: vendedor.token, cuerpo });
    await llamar(api, 'POST', '/remesas', { token: vendedor.token, cuerpo });
    await esperar(300);

    expect(recibidos).toHaveLength(1);
  });

  it('una operación rechazada no avisa de nada', async () => {
    const { api, url } = await arrancar();
    const [vendedor, admin] = await Promise.all([sesion('vendedor'), sesion('administrador')]);
    const cuerpo = await prepararRemesa(vendedor.id, admin.id);
    const recibidos = escuchar(
      await conectarComo(url, vendedor.token),
      EVENTOS_TIEMPO_REAL.remesaCambio,
    );

    const respuesta = await llamar(api, 'POST', '/remesas', {
      token: vendedor.token,
      cuerpo: { ...cuerpo, cuentaIngresoId: randomUUID() },
    });
    await esperar(300);

    expect(respuesta.statusCode).toBe(409);
    expect(recibidos).toEqual([]);
  });
});

describe('leerCookie', () => {
  it('encuentra la cookie entre varias y decodifica su valor', () => {
    const cabecera = 'tema=oscuro; cambios_sesion=abc%2Bdef; otra=1';

    expect(leerCookie(cabecera, 'cambios_sesion')).toBe('abc+def');
    expect(leerCookie(cabecera, 'tema')).toBe('oscuro');
  });

  it('devuelve undefined si no existe o la cabecera falta', () => {
    expect(leerCookie('a=1', 'cambios_sesion')).toBeUndefined();
    expect(leerCookie(undefined, 'cambios_sesion')).toBeUndefined();
    expect(leerCookie('cambios_sesion=%E0%A4%A', 'cambios_sesion')).toBeUndefined();
  });
});
