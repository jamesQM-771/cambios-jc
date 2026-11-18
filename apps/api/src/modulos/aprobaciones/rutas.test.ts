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
import { saldoDeCuenta } from '../../lib/libro.js';
import { crearPrisma, type PrismaClient } from '../../lib/prisma.js';

let prisma: PrismaClient;
let app: FastifyInstance | undefined;
const APAGADO = {
  reaperturaJornada: false,
  devoluciones: false,
  anulaciones: false,
  ajustes: false,
};

beforeAll(async () => {
  prisma = crearPrisma();
  await asegurarEmpresa(prisma);
});

// El doble control es de toda la instalación: cada prueba arranca con todo apagado.
beforeEach(async () => {
  await prisma.parametrosDobleControl.upsert({
    where: { unica: true },
    update: APAGADO,
    create: APAGADO,
  });
});

afterAll(async () => {
  await prisma.parametrosDobleControl.update({ where: { unica: true }, data: APAGADO });
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

async function sesion(rol: 'administrador' | 'vendedor') {
  const usuario = await crearUsuarioDePrueba(prisma, { rol });
  return { id: usuario.id, token: await abrirSesion(prisma, usuario.id) };
}

interface SolicitudJson {
  id: string;
  accion: string;
  estado: string;
  aprobador: { id: string } | null;
}

async function escenario() {
  const [adminA, adminB, vendedor] = await Promise.all([
    sesion('administrador'),
    sesion('administrador'),
    sesion('vendedor'),
  ]);
  const sucursal = await prisma.sucursal.create({
    data: { nombre: `Sucursal ${unico()}`, ciudad: 'Cúcuta' },
  });
  const boveda = await prisma.cuentaDinero.create({
    data: { nombre: `Bóveda ${unico()}`, tipo: 'caja', moneda: 'COP', sucursalId: sucursal.id },
  });
  const categoria = await prisma.categoriaGasto.create({
    data: { nombre: `Categoría ${unico()}` },
  });
  const api = nuevaApp();
  const encender = (cambios: Partial<typeof APAGADO>) =>
    api.inject({
      method: 'PUT',
      url: '/aprobaciones/parametros',
      headers: conSesion(adminA.token),
      payload: { ...APAGADO, ...cambios },
    });
  const gasto = async () => {
    const respuesta = await llamar(api, 'POST', '/gastos', {
      token: adminA.token,
      cuerpo: {
        claveIdempotencia: randomUUID(),
        categoriaId: categoria.id,
        descripcion: 'Papelería',
        cuentaId: boveda.id,
        monto: '15000',
      },
    });
    return respuesta.json<{ gasto: { id: string } }>().gasto.id;
  };
  return { api, adminA, adminB, vendedor, boveda: boveda.id, encender, gasto };
}

describe('doble control', () => {
  it('apagado (por defecto), anular se hace directo', async () => {
    const e = await escenario();
    const id = await e.gasto();
    const anulado = await llamar(e.api, 'POST', `/gastos/${id}/anular`, {
      token: e.adminA.token,
      cuerpo: { motivo: 'Duplicado' },
    });
    expect(anulado.statusCode).toBe(200);
  });

  it('encendido: la anulación queda pendiente; nadie aprueba lo propio; otra persona la ejecuta', async () => {
    const e = await escenario();
    expect((await e.encender({ anulaciones: true })).statusCode).toBe(200);
    const id = await e.gasto();
    expect((await saldoDeCuenta(prisma, e.boveda)).toFixed(2)).toBe('-15000.00');

    const pedida = await llamar(e.api, 'POST', `/gastos/${id}/anular`, {
      token: e.adminA.token,
      cuerpo: { motivo: 'Se pagó dos veces' },
    });
    expect(pedida.statusCode).toBe(202);
    const { solicitud } = pedida.json<{ solicitud: SolicitudJson }>();
    expect(solicitud).toMatchObject({
      accion: 'anular_gasto',
      estado: 'pendiente',
      aprobador: null,
    });
    expect(await prisma.gasto.findUnique({ where: { id } })).toMatchObject({ anuladoEn: null });

    const otraVez = await llamar(e.api, 'POST', `/gastos/${id}/anular`, {
      token: e.adminA.token,
      cuerpo: { motivo: 'Insisto' },
    });
    expect(otraVez.statusCode).toBe(409);

    const propia = await llamar(e.api, 'POST', `/aprobaciones/${solicitud.id}/aprobar`, {
      token: e.adminA.token,
    });
    expect(propia.statusCode).toBe(409);
    expect(cuerpoError(propia).mensaje).toMatch(/propia solicitud/);

    const aprobada = await llamar(e.api, 'POST', `/aprobaciones/${solicitud.id}/aprobar`, {
      token: e.adminB.token,
    });
    expect(aprobada.statusCode).toBe(200);
    expect(aprobada.json()).toMatchObject({
      solicitud: { estado: 'aprobada', aprobador: { id: e.adminB.id } },
    });
    expect(await prisma.gasto.findUnique({ where: { id } })).toMatchObject({
      anuladoPorId: e.adminB.id,
      motivoAnulacion: 'Se pagó dos veces',
    });
    expect((await saldoDeCuenta(prisma, e.boveda)).toFixed(2)).toBe('0.00');
    const doble = await llamar(e.api, 'POST', `/aprobaciones/${solicitud.id}/aprobar`, {
      token: e.adminB.token,
    });
    expect(doble.statusCode).toBe(409);
  });

  it('rechazar deja todo como estaba y queda con su comentario', async () => {
    const e = await escenario();
    await e.encender({ anulaciones: true });
    const id = await e.gasto();
    const { solicitud } = (
      await llamar(e.api, 'POST', `/gastos/${id}/anular`, {
        token: e.adminA.token,
        cuerpo: { motivo: 'Error' },
      })
    ).json<{ solicitud: SolicitudJson }>();
    const rechazada = await llamar(e.api, 'POST', `/aprobaciones/${solicitud.id}/rechazar`, {
      token: e.adminB.token,
      cuerpo: { comentario: 'El gasto sí ocurrió' },
    });
    expect(rechazada.json()).toMatchObject({ solicitud: { estado: 'rechazada' } });
    expect(await prisma.gasto.findUnique({ where: { id } })).toMatchObject({ anuladoEn: null });
    const pendientes = await llamar(e.api, 'GET', '/aprobaciones', {
      token: e.adminB.token,
      consulta: 'estado=pendiente',
    });
    expect(
      pendientes.json<{ solicitudes: SolicitudJson[] }>().solicitudes.map((s) => s.id),
    ).not.toContain(solicitud.id);
  });

  it('los ajustes de contrapartes e inventario también pasan por aprobación', async () => {
    const e = await escenario();
    await e.encender({ ajustes: true });
    const contraparte = await prisma.contraparte.create({
      data: { nombre: `Proveedor ${unico()}`, tipo: 'proveedor', creadoPorId: e.adminA.id },
    });
    const ajuste = await llamar(e.api, 'POST', `/contrapartes/${contraparte.id}/movimientos`, {
      token: e.adminA.token,
      cuerpo: {
        claveIdempotencia: randomUUID(),
        tipo: 'ajuste',
        moneda: 'COP',
        monto: '1000',
        signo: 1,
        nota: 'Corrección',
      },
    });
    expect(ajuste.statusCode).toBe(202);
    // Un préstamo (no es ajuste) no pide aprobación.
    const prestamo = await llamar(e.api, 'POST', `/contrapartes/${contraparte.id}/movimientos`, {
      token: e.adminA.token,
      cuerpo: {
        claveIdempotencia: randomUUID(),
        tipo: 'prestamo_otorgado',
        moneda: 'COP',
        monto: '500',
      },
    });
    expect(prestamo.statusCode).toBe(201);
    const { solicitud } = ajuste.json<{ solicitud: SolicitudJson }>();
    await llamar(e.api, 'POST', `/aprobaciones/${solicitud.id}/aprobar`, { token: e.adminB.token });
    expect(
      await prisma.movimientoContraparte.count({ where: { contraparteId: contraparte.id } }),
    ).toBe(2);

    const inventario = await llamar(e.api, 'POST', '/inventario/VES/ajustes', {
      token: e.adminA.token,
      cuerpo: { sentido: 'salida', cantidad: '1', motivo: 'Prueba de doble control' },
    });
    expect(inventario.statusCode).toBe(202);
    const aprobada = await llamar(
      e.api,
      'POST',
      `/aprobaciones/${inventario.json<{ solicitud: SolicitudJson }>().solicitud.id}/aprobar`,
      { token: e.adminB.token },
    );
    expect(aprobada.statusCode).toBe(200);
  });

  it('la bandeja es de quien aprueba; los parámetros, de quien configura', async () => {
    const e = await escenario();
    for (const url of ['/aprobaciones', '/aprobaciones/parametros']) {
      const respuesta = await llamar(e.api, 'GET', url, { token: e.vendedor.token });
      expect(respuesta.statusCode, url).toBe(403);
    }
    const cambiar = await e.api.inject({
      method: 'PUT',
      url: '/aprobaciones/parametros',
      headers: conSesion(e.vendedor.token),
      payload: APAGADO,
    });
    expect(cambiar.statusCode).toBe(403);
  });
});
