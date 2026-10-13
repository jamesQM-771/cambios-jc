import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { cerrarApp, crearAppPrueba } from '../../../test/ayudas.js';
import {
  abrirSesion,
  aTexto,
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

async function sesion(rol: 'vendedor' | 'administrador' | 'digitador') {
  const usuario = await crearUsuarioDePrueba(prisma, { rol });
  return { id: usuario.id, token: await abrirSesion(prisma, usuario.id) };
}

// Números únicos por corrida: la base de pruebas no se vacía entre archivos.
let contador = 0;
const numeroUnico = (): string => {
  contador += 1;
  return String(40_000_000 + ((Date.now() + contador * 7919) % 50_000_000));
};

interface ClienteJson {
  id: string;
  tipoDocumento: string;
  numeroDocumento: string;
  nombre: string;
  telefono: string | null;
  activo: boolean;
  mediosPago: { id: string; tipo: string; activo: boolean; numeroCuenta: string | null }[];
}

async function crearCliente(api: FastifyInstance, token: string, extra = {}) {
  const respuesta = await llamar(api, 'POST', '/clientes', {
    token,
    cuerpo: {
      tipoDocumento: 'V',
      numeroDocumento: numeroUnico(),
      nombre: 'María Pérez',
      ...extra,
    },
  });
  return { respuesta, cliente: respuesta.json<{ cliente: ClienteJson }>().cliente };
}

/** Banco propio de esta prueba: la base de pruebas no trae la semilla de bancos. */
async function bancoActivo() {
  const codigo = '9123';
  return prisma.banco.upsert({
    where: { codigo },
    update: { activo: true },
    create: { codigo, nombre: 'Banco de prueba de clientes' },
  });
}

describe('acceso a la API de clientes', () => {
  const id = randomUUID();
  const rutas: ['GET' | 'POST' | 'PATCH', string][] = [
    ['GET', '/clientes'],
    ['POST', '/clientes'],
    ['GET', `/clientes/${id}`],
    ['PATCH', `/clientes/${id}`],
    ['POST', `/clientes/${id}/desactivar`],
    ['POST', `/clientes/${id}/reactivar`],
    ['POST', `/clientes/${id}/medios-pago`],
    ['POST', `/clientes/${id}/medios-pago/${randomUUID()}/desactivar`],
  ];

  it.each(rutas)('%s %s: sin sesión responde 401', async (metodo, url) => {
    const respuesta = await llamar(nuevaApp(), metodo, url);
    expect(respuesta.statusCode).toBe(401);
  });

  it('el digitador recibe 403 en todas las rutas: nunca ve datos de clientes', async () => {
    const { token } = await sesion('digitador');
    const api = nuevaApp();

    for (const [metodo, url] of rutas) {
      const respuesta = await llamar(api, metodo, url, { token });
      expect(respuesta.statusCode, `${metodo} ${url}`).toBe(403);
      expect(cuerpoError(respuesta).codigo).toBe('SIN_PERMISO');
    }
  });
});

describe('crear y buscar clientes', () => {
  it('el vendedor crea un cliente y el número queda normalizado', async () => {
    const { token } = await sesion('vendedor');
    const numero = numeroUnico();

    const { respuesta, cliente } = await crearCliente(nuevaApp(), token, {
      numeroDocumento: ` ${numero.slice(0, 2)}.${numero.slice(2)} `,
      nombre: '  Ana Gómez ',
      telefono: '+573001234567',
    });

    expect(respuesta.statusCode).toBe(201);
    expect(cliente).toMatchObject({
      tipoDocumento: 'V',
      numeroDocumento: numero,
      nombre: 'Ana Gómez',
      telefono: '+573001234567',
      activo: true,
      mediosPago: [],
    });
  });

  it('rechaza el mismo tipo y número de documento, pero acepta otro tipo', async () => {
    const { token } = await sesion('vendedor');
    const api = nuevaApp();
    const numero = numeroUnico();
    await crearCliente(api, token, { numeroDocumento: numero });

    const repetido = await crearCliente(api, token, { numeroDocumento: numero });
    const otroTipo = await crearCliente(api, token, {
      numeroDocumento: numero,
      tipoDocumento: 'E',
    });

    expect(repetido.respuesta.statusCode).toBe(409);
    expect(cuerpoError(repetido.respuesta).codigo).toBe('VALOR_EN_USO');
    expect(otroTipo.respuesta.statusCode).toBe(201);
  });

  it.each([
    ['V', '12', 'dígitos'],
    ['V', 'ABC12345', 'dígitos'],
    ['CC', '1234567890123', 'dígitos'],
    ['P', 'A1', 'letras o números'],
  ])('rechaza un documento %s inválido (%s)', async (tipoDocumento, numeroDocumento) => {
    const { token } = await sesion('vendedor');

    const { respuesta } = await crearCliente(nuevaApp(), token, { tipoDocumento, numeroDocumento });

    expect(respuesta.statusCode).toBe(400);
    expect(cuerpoError(respuesta).codigo).toBe('VALIDACION_FALLIDA');
  });

  it('un pasaporte puede llevar letras', async () => {
    const { token } = await sesion('vendedor');

    const { respuesta, cliente } = await crearCliente(nuevaApp(), token, {
      tipoDocumento: 'PAS',
      numeroDocumento: `ab${numeroUnico()}`,
    });

    expect(respuesta.statusCode).toBe(201);
    expect(cliente.numeroDocumento.startsWith('AB')).toBe(true);
  });

  it('busca por documento (con o sin separadores) y por parte del nombre', async () => {
    const { token } = await sesion('vendedor');
    const api = nuevaApp();
    const numero = numeroUnico();
    const nombre = `Zulema ${randomUUID().slice(0, 8)}`;
    const { cliente } = await crearCliente(api, token, { numeroDocumento: numero, nombre });

    const porDocumento = await llamar(
      api,
      'GET',
      `/clientes?busqueda=${numero.slice(0, 2)}.${numero.slice(2)}`,
      { token },
    );
    const porNombre = await llamar(
      api,
      'GET',
      `/clientes?busqueda=${encodeURIComponent(nombre.toLowerCase())}`,
      { token },
    );

    for (const respuesta of [porDocumento, porNombre]) {
      expect(respuesta.statusCode).toBe(200);
      const { clientes } = respuesta.json<{ clientes: ClienteJson[] }>();
      expect(clientes.map((c) => c.id)).toContain(cliente.id);
    }
  });

  it('desactivar y reactivar un cliente queda en la bitácora', async () => {
    const { token } = await sesion('administrador');
    const api = nuevaApp();
    const { cliente } = await crearCliente(api, token);

    const desactivado = await llamar(api, 'POST', `/clientes/${cliente.id}/desactivar`, { token });
    const reactivado = await llamar(api, 'POST', `/clientes/${cliente.id}/reactivar`, { token });

    expect(desactivado.json<{ cliente: ClienteJson }>().cliente.activo).toBe(false);
    expect(reactivado.json<{ cliente: ClienteJson }>().cliente.activo).toBe(true);
    const acciones = await prisma.auditoria.findMany({
      where: { entidad: 'cliente', entidadId: cliente.id },
      select: { accion: true },
    });
    expect(acciones.map((a) => a.accion).sort()).toEqual([
      'cliente.crear',
      'cliente.desactivar',
      'cliente.reactivar',
    ]);
  });

  it('edita nombre y teléfono, pero no el documento', async () => {
    const { token } = await sesion('vendedor');
    const api = nuevaApp();
    const { cliente } = await crearCliente(api, token);

    const editado = await llamar(api, 'PATCH', `/clientes/${cliente.id}`, {
      token,
      cuerpo: { nombre: 'Nombre Corregido', telefono: null },
    });
    const intentoDocumento = await llamar(api, 'PATCH', `/clientes/${cliente.id}`, {
      token,
      cuerpo: { numeroDocumento: '99999999' },
    });

    expect(editado.json<{ cliente: ClienteJson }>().cliente.nombre).toBe('Nombre Corregido');
    expect(intentoDocumento.statusCode).toBe(400);
  });

  it('la bitácora no guarda el documento ni el teléfono completos', async () => {
    const { token } = await sesion('vendedor');
    const numero = numeroUnico();
    const { cliente } = await crearCliente(nuevaApp(), token, {
      numeroDocumento: numero,
      telefono: '+573009998877',
    });

    const registros = await prisma.auditoria.findMany({ where: { entidadId: cliente.id } });

    const texto = aTexto(registros);
    expect(texto).not.toContain(numero);
    expect(texto).not.toContain('3009998877');
  });
});

describe('medios de pago', () => {
  const cuentaDe = (codigo: string) =>
    `${codigo}${String(Date.now()).slice(-16).padStart(16, '0')}`;

  it('guarda una cuenta bancaria cuyo inicio coincide con el banco', async () => {
    const { token } = await sesion('vendedor');
    const api = nuevaApp();
    const banco = await bancoActivo();
    const { cliente } = await crearCliente(api, token);
    const cuenta = cuentaDe(banco.codigo);

    const respuesta = await llamar(api, 'POST', `/clientes/${cliente.id}/medios-pago`, {
      token,
      cuerpo: {
        tipo: 'cuenta_bancaria',
        bancoId: banco.id,
        numeroCuenta: `${cuenta.slice(0, 4)} ${cuenta.slice(4, 8)} ${cuenta.slice(8)}`,
        titular: 'Pedro Titular',
        tipoDocumentoTitular: 'V',
        numeroDocumentoTitular: '12.345.678',
      },
    });

    expect(respuesta.statusCode).toBe(201);
    const { medioPago } = respuesta.json<{
      medioPago: {
        numeroCuenta: string;
        numeroDocumentoTitular: string;
        banco: { codigo: string };
      };
    }>();
    expect(medioPago).toMatchObject({
      numeroCuenta: cuenta,
      numeroDocumentoTitular: '12345678',
      banco: { codigo: banco.codigo },
    });
    const detalle = await llamar(api, 'GET', `/clientes/${cliente.id}`, { token });
    expect(detalle.json<{ cliente: ClienteJson }>().cliente.mediosPago).toHaveLength(1);
  });

  it('rechaza una cuenta que no empieza por el código del banco', async () => {
    const { token } = await sesion('vendedor');
    const api = nuevaApp();
    const banco = await bancoActivo();
    const otro = '9998';
    const { cliente } = await crearCliente(api, token);

    const respuesta = await llamar(api, 'POST', `/clientes/${cliente.id}/medios-pago`, {
      token,
      cuerpo: {
        tipo: 'cuenta_bancaria',
        bancoId: banco.id,
        numeroCuenta: cuentaDe(otro),
        titular: 'Pedro Titular',
        tipoDocumentoTitular: 'V',
        numeroDocumentoTitular: '12345678',
      },
    });

    expect(respuesta.statusCode).toBe(409);
    expect(cuerpoError(respuesta).mensaje).toContain(banco.codigo);
  });

  it.each(['123', '1234567890123456789A', '123456789012345678901'])(
    'rechaza un número de cuenta que no son 20 dígitos (%s)',
    async (numeroCuenta) => {
      const { token } = await sesion('vendedor');
      const api = nuevaApp();
      const banco = await bancoActivo();
      const { cliente } = await crearCliente(api, token);

      const respuesta = await llamar(api, 'POST', `/clientes/${cliente.id}/medios-pago`, {
        token,
        cuerpo: {
          tipo: 'cuenta_bancaria',
          bancoId: banco.id,
          numeroCuenta,
          titular: 'Pedro Titular',
          tipoDocumentoTitular: 'V',
          numeroDocumentoTitular: '12345678',
        },
      });

      expect(respuesta.statusCode).toBe(400);
    },
  );

  it('guarda un pago móvil y valida el teléfono de 11 dígitos', async () => {
    const { token } = await sesion('vendedor');
    const api = nuevaApp();
    const banco = await bancoActivo();
    const { cliente } = await crearCliente(api, token);
    const base = {
      tipo: 'pago_movil',
      bancoId: banco.id,
      titular: 'Lucía Móvil',
      tipoDocumentoTitular: 'V',
      numeroDocumentoTitular: '23456789',
    };

    const bueno = await llamar(api, 'POST', `/clientes/${cliente.id}/medios-pago`, {
      token,
      cuerpo: { ...base, telefonoPagoMovil: '0414-1234567' },
    });
    const malo = await llamar(api, 'POST', `/clientes/${cliente.id}/medios-pago`, {
      token,
      cuerpo: { ...base, telefonoPagoMovil: '4141234567' },
    });

    expect(bueno.statusCode).toBe(201);
    expect(
      bueno.json<{ medioPago: { telefonoPagoMovil: string } }>().medioPago.telefonoPagoMovil,
    ).toBe('04141234567');
    expect(malo.statusCode).toBe(400);
  });

  it('no acepta un banco desactivado ni un cliente desactivado', async () => {
    const { token } = await sesion('administrador');
    const api = nuevaApp();
    const codigo = '9777';
    const bancoInactivo = await prisma.banco.upsert({
      where: { codigo },
      update: { activo: false },
      create: { codigo, nombre: 'Banco inactivo de prueba', activo: false },
    });
    const banco = await bancoActivo();
    const { cliente } = await crearCliente(api, token);
    const datos = (bancoId: string, codigoBanco: string) => ({
      tipo: 'cuenta_bancaria',
      bancoId,
      numeroCuenta: cuentaDe(codigoBanco),
      titular: 'Pedro Titular',
      tipoDocumentoTitular: 'V',
      numeroDocumentoTitular: '12345678',
    });

    const conBancoInactivo = await llamar(api, 'POST', `/clientes/${cliente.id}/medios-pago`, {
      token,
      cuerpo: datos(bancoInactivo.id, codigo),
    });
    await llamar(api, 'POST', `/clientes/${cliente.id}/desactivar`, { token });
    const conClienteInactivo = await llamar(api, 'POST', `/clientes/${cliente.id}/medios-pago`, {
      token,
      cuerpo: datos(banco.id, banco.codigo),
    });

    expect(conBancoInactivo.statusCode).toBe(409);
    expect(conClienteInactivo.statusCode).toBe(409);
    expect(cuerpoError(conClienteInactivo).codigo).toBe('ESTADO_INVALIDO');
  });

  it('un medio de pago no se edita: solo se desactiva y se reactiva', async () => {
    const { token } = await sesion('vendedor');
    const api = nuevaApp();
    const banco = await bancoActivo();
    const { cliente } = await crearCliente(api, token);
    const creado = await llamar(api, 'POST', `/clientes/${cliente.id}/medios-pago`, {
      token,
      cuerpo: {
        tipo: 'cuenta_bancaria',
        bancoId: banco.id,
        numeroCuenta: cuentaDe(banco.codigo),
        titular: 'Pedro Titular',
        tipoDocumentoTitular: 'V',
        numeroDocumentoTitular: '12345678',
      },
    });
    const medioId = creado.json<{ medioPago: { id: string } }>().medioPago.id;

    const desactivado = await llamar(
      api,
      'POST',
      `/clientes/${cliente.id}/medios-pago/${medioId}/desactivar`,
      { token },
    );
    const edicion = await llamar(api, 'PATCH', `/clientes/${cliente.id}/medios-pago/${medioId}`, {
      token,
      cuerpo: { titular: 'Otro' },
    });
    const deOtroCliente = await llamar(
      api,
      'POST',
      `/clientes/${randomUUID()}/medios-pago/${medioId}/reactivar`,
      { token },
    );

    expect(desactivado.json<{ medioPago: { activo: boolean } }>().medioPago.activo).toBe(false);
    expect(edicion.statusCode).toBe(404);
    expect(deOtroCliente.statusCode).toBe(404);
  });
});

describe('bancos disponibles', () => {
  it('el vendedor ve los bancos activos para agregar datos de pago, sin tener acceso a Configuración', async () => {
    const { token } = await sesion('vendedor');
    const banco = await bancoActivo();
    const api = nuevaApp();
    await prisma.banco.upsert({
      where: { codigo: '9555' },
      update: { activo: false },
      create: { codigo: '9555', nombre: 'Banco apagado', activo: false },
    });

    const respuesta = await llamar(api, 'GET', '/clientes/bancos', { token });

    expect(respuesta.statusCode).toBe(200);
    const { bancos } = respuesta.json<{ bancos: { id: string; codigo: string }[] }>();
    expect(bancos.map((b) => b.id)).toContain(banco.id);
    expect(bancos.map((b) => b.codigo)).not.toContain('9555');
    // Y la lista de Configuración sigue cerrada para él.
    expect((await llamar(api, 'GET', '/bancos', { token })).statusCode).toBe(403);
  });

  it('el digitador no la ve', async () => {
    const { token } = await sesion('digitador');

    const respuesta = await llamar(nuevaApp(), 'GET', '/clientes/bancos', { token });

    expect(respuesta.statusCode).toBe(403);
  });
});
