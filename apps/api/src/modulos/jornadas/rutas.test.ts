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
import { abrirTurnoDePrueba } from '../../../test/turnos.js';
import { registrarMovimiento } from '../../lib/libro.js';
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
  sucursalId: string;
  cajaId: string;
  efectivo: string;
  boveda: string;
  billetera: string;
  turnoId: string;
  jornadaId: string;
}

/** Una sucursal con una caja (turno abierto del vendedor), la bóveda y una billetera. */
async function escenario(): Promise<Escenario> {
  const [vendedor, admin] = await Promise.all([sesion('vendedor'), sesion('administrador')]);
  const sucursal = await prisma.sucursal.create({
    data: { nombre: `Sucursal ${unico()}`, ciudad: 'Cúcuta' },
  });
  const caja = await prisma.caja.create({
    data: { nombre: `Caja ${unico()}`, sucursalId: sucursal.id },
  });
  const cuenta = (nombre: string, tipo: 'caja' | 'billetera', cajaId?: string) =>
    prisma.cuentaDinero.create({
      data: {
        nombre: `${nombre} ${unico()}`,
        tipo,
        moneda: 'COP',
        sucursalId: sucursal.id,
        ...(cajaId ? { cajaId } : {}),
      },
    });
  const [efectivo, boveda, billetera] = await Promise.all([
    cuenta('Efectivo', 'caja', caja.id),
    cuenta('Bóveda', 'caja'),
    cuenta('Billetera', 'billetera'),
  ]);
  const { turnoId } = await abrirTurnoDePrueba(prisma, {
    usuarioId: vendedor.id,
    cuentaCajaId: efectivo.id,
  });
  const turno = await prisma.turno.findUniqueOrThrow({ where: { id: turnoId } });
  return {
    vendedor,
    admin,
    sucursalId: sucursal.id,
    cajaId: caja.id,
    efectivo: efectivo.id,
    boveda: boveda.id,
    billetera: billetera.id,
    turnoId,
    jornadaId: turno.jornadaId,
  };
}

/** Cierra el turno directo en la base (el cierre por la API ya tiene sus propias pruebas, D127). */
async function cerrarTurno(
  e: Escenario,
  cierre: { contado?: string; esperado?: string; diferencia?: string; explicacion?: string } = {},
) {
  await prisma.turno.update({
    where: { id: e.turnoId },
    data: { estado: 'cerrado', cerradoEn: new Date(), cajaEnUso: null, usuarioEnUso: null },
  });
  await prisma.saldoTurno.create({
    data: {
      turnoId: e.turnoId,
      momento: 'cierre',
      moneda: 'COP',
      contado: cierre.contado ?? '160005',
      esperado: cierre.esperado ?? '160005',
      diferencia: cierre.diferencia ?? '0',
      explicacion: cierre.explicacion ?? null,
    },
  });
}

/** Una remesa en el estado pedido, ingresada por la cuenta de efectivo de la sucursal. */
async function remesaEn(e: Escenario, estado: 'tomada' | 'completada' | 'anulada' | 'devuelta') {
  const linea = await prisma.lineaNegocio.create({
    data: {
      nombre: `Remesas ${unico()}`,
      clase: 'remesa',
      monedaOrigen: 'COP',
      monedaDestino: 'VES',
    },
  });
  const tasa = await prisma.tasa.create({
    data: { lineaNegocioId: linea.id, tasaVenta: '3.760000', publicadaPorId: e.admin.id },
  });
  const remitente = await prisma.cliente.create({
    data: {
      tipoDocumento: 'CC',
      numeroDocumento: String(Math.floor(Math.random() * 9e9) + 1e9),
      nombre: 'Remitente de la jornada',
      creadoPorId: e.vendedor.id,
    },
  });
  return prisma.operacion.create({
    data: {
      numeroComprobante: Math.floor(Math.random() * 9e8) + 1e9,
      tipo: 'remesa_venta',
      estado,
      lineaNegocioId: linea.id,
      tasaId: tasa.id,
      remitenteId: remitente.id,
      formaPago: 'efectivo',
      cuentaIngresoId: e.efectivo,
      montoPesos: '162000',
      montoBolivares: '43085.106',
      tasaCalculada: '3.760000',
      tasaUsada: '3.760000',
      claveIdempotencia: randomUUID(),
      codigoSeguimiento: randomUUID().replaceAll('-', '').slice(0, 16),
      creadoPorId: e.vendedor.id,
    },
  });
}

const mover = (
  e: Escenario,
  cuentaId: string,
  sentido: 'entrada' | 'salida',
  monto: string,
  origen: 'remesa_ingreso' | 'remesa_devolucion' | 'traslado_entrada' = 'traslado_entrada',
) =>
  prisma.$transaction((tx) =>
    registrarMovimiento(tx, {
      cuentaId,
      sentido,
      monto,
      moneda: 'COP',
      origen,
      usuarioId: e.vendedor.id,
    }),
  );

const saldosDe = (e: Escenario, reportados: { boveda?: string; billetera?: string } = {}) => ({
  saldos: [
    { cuentaId: e.boveda, reportado: reportados.boveda ?? '1000000' },
    { cuentaId: e.billetera, reportado: reportados.billetera ?? '500000' },
  ],
});

interface DetalleJson {
  jornada: { id: string; estado: string; ciclo: number; turnosAbiertos: number };
  pendientes: { turnosAbiertos: { id: string }[]; remesasTomadas: number };
  cuentasPorArquear: { cuenta: { id: string }; esperado: string | null }[];
  saldosReportados: {
    cuenta: { id: string };
    esperado: string | null;
    reportado: string;
    diferencia: string | null;
    explicacion: string | null;
    resultado: string | null;
  }[];
  resumen: {
    disponible: { cuenta: { id: string }; saldo: string | null; origen: string }[];
    totalDisponible: { moneda: string; total: string }[];
    remesas: Record<string, number>;
    pesosRecibidos: { moneda: string; total: string }[];
    devoluciones: { moneda: string; total: string }[];
    gastosOperativos: { moneda: string; total: string }[];
    retirosDelDueno: { moneda: string; total: string }[];
    traslados: number;
    diferenciasDeArqueo: { resultado: string; diferencia: string; explicacion: string | null }[];
  };
  eventos: { tipo: string; motivo: string | null }[];
}

const detalleDe = (respuesta: { json: () => unknown }): DetalleJson =>
  (respuesta.json() as { detalle: DetalleJson }).detalle;

const ver = (api: FastifyInstance, token: string, id: string) =>
  llamar(api, 'GET', `/jornadas/${id}`, { token });
const cerrar = (api: FastifyInstance, token: string, id: string, cuerpo: unknown) =>
  llamar(api, 'POST', `/jornadas/${id}/cerrar`, { token, cuerpo });
const reabrir = (api: FastifyInstance, token: string, id: string, motivo: string) =>
  llamar(api, 'POST', `/jornadas/${id}/reabrir`, { token, cuerpo: { motivo } });

describe('acceso', () => {
  it('exige sesión; el vendedor y el digitador no ven ni cierran jornadas', async () => {
    const e = await escenario();
    const api = nuevaApp();
    const digitador = await sesion('digitador');
    const rutas = [
      ['GET', '/jornadas', undefined],
      ['GET', `/jornadas/${e.jornadaId}`, undefined],
      ['POST', `/jornadas/${e.jornadaId}/cerrar`, saldosDe(e)],
      ['POST', `/jornadas/${e.jornadaId}/reabrir`, { motivo: 'prueba' }],
    ] as const;

    for (const [metodo, url, cuerpo] of rutas) {
      expect((await llamar(api, metodo, url, { cuerpo })).statusCode, `${url} sin sesión`).toBe(
        401,
      );
      for (const quien of [e.vendedor, digitador]) {
        const respuesta = await llamar(api, metodo, url, { token: quien.token, cuerpo });
        expect(respuesta.statusCode, `${metodo} ${url}`).toBe(403);
        expect(cuerpoError(respuesta).codigo).toBe('SIN_PERMISO');
      }
    }
  });
});

describe('consultar', () => {
  it('lista las jornadas y filtra por sucursal y estado', async () => {
    const e = await escenario();
    const api = nuevaApp();

    const lista = await llamar(api, 'GET', '/jornadas', {
      token: e.admin.token,
      consulta: `sucursalId=${e.sucursalId}&estado=abierta`,
    });
    const cerradas = await llamar(api, 'GET', '/jornadas', {
      token: e.admin.token,
      consulta: `sucursalId=${e.sucursalId}&estado=cerrada`,
    });

    expect(lista.json<{ jornadas: { id: string; turnosAbiertos: number }[] }>().jornadas).toEqual([
      expect.objectContaining({ id: e.jornadaId, turnosAbiertos: 1 }),
    ]);
    expect(cerradas.json<{ jornadas: unknown[] }>().jornadas).toHaveLength(0);
  });

  it('el detalle de una jornada abierta dice qué falta y qué cuentas hay que arquear', async () => {
    const e = await escenario();
    await remesaEn(e, 'tomada');

    const respuesta = await ver(nuevaApp(), e.admin.token, e.jornadaId);

    expect(respuesta.statusCode).toBe(200);
    const detalle = detalleDe(respuesta);
    expect(detalle.jornada).toMatchObject({ estado: 'abierta', ciclo: 0, turnosAbiertos: 1 });
    expect(detalle.pendientes.turnosAbiertos.map((t) => t.id)).toEqual([e.turnoId]);
    expect(detalle.pendientes.remesasTomadas).toBe(1);
    // La caja no se arquea aquí (la contó su vendedor); sí la bóveda y la billetera.
    expect(detalle.cuentasPorArquear.map((c) => c.cuenta.id).sort()).toEqual(
      [e.boveda, e.billetera].sort(),
    );
    expect(detalle.cuentasPorArquear.every((c) => c.esperado === null)).toBe(true);
    expect((await ver(nuevaApp(), e.admin.token, randomUUID())).statusCode).toBe(404);
  });

  it('el resumen en vivo cuenta remesas, gastos, retiros, devoluciones y diferencias de arqueo', async () => {
    const e = await escenario();
    const categoria = await prisma.categoriaGasto.create({
      data: { nombre: `Categoría ${unico()}` },
    });
    await remesaEn(e, 'completada');
    await remesaEn(e, 'anulada');
    await remesaEn(e, 'devuelta');
    await mover(e, e.efectivo, 'entrada', '162000', 'remesa_ingreso');
    await mover(e, e.efectivo, 'salida', '40000', 'remesa_devolucion');
    for (const [tipo, monto] of [
      ['operativo', '85000'],
      ['retiro_dueno', '300000'],
    ] as const) {
      await prisma.gasto.create({
        data: {
          tipo,
          ...(tipo === 'operativo' ? { categoriaId: categoria.id } : {}),
          descripcion: 'Prueba del resumen',
          cuentaId: e.efectivo,
          monto,
          claveIdempotencia: randomUUID(),
          creadoPorId: e.admin.id,
        },
      });
    }
    await cerrarTurno(e, {
      contado: '140004',
      diferencia: '-20001',
      explicacion: 'Un billete que se dio de vueltos',
    });

    const { resumen } = detalleDe(await ver(nuevaApp(), e.admin.token, e.jornadaId));

    expect(resumen.remesas).toMatchObject({
      registradas: 3,
      completadas: 1,
      anuladas: 1,
      devueltas: 1,
      pendientes: 0,
    });
    expect(resumen.pesosRecibidos).toEqual([{ moneda: 'COP', total: '162000.00' }]);
    expect(resumen.devoluciones).toEqual([{ moneda: 'COP', total: '40000.00' }]);
    expect(resumen.gastosOperativos).toEqual([{ moneda: 'COP', total: '85000.00' }]);
    expect(resumen.retirosDelDueno).toEqual([{ moneda: 'COP', total: '300000.00' }]);
    expect(resumen.diferenciasDeArqueo).toEqual([
      expect.objectContaining({
        resultado: 'faltante',
        diferencia: '-20001.00',
        explicacion: 'Un billete que se dio de vueltos',
      }),
    ]);
    // El efectivo de la caja es lo que contó su vendedor al cerrar su turno.
    expect(resumen.disponible.find((d) => d.cuenta.id === e.efectivo)).toMatchObject({
      saldo: '140004.00',
      origen: 'conteo_de_turno',
    });
  });
});

describe('cerrar la jornada', () => {
  it('no se cierra con un turno abierto ni con una remesa tomada', async () => {
    const e = await escenario();
    const api = nuevaApp();

    const conTurno = await cerrar(api, e.admin.token, e.jornadaId, saldosDe(e));
    expect(conTurno.statusCode).toBe(409);
    expect(cuerpoError(conTurno).mensaje).toContain('turno(s) abierto(s)');

    await cerrarTurno(e);
    const tomada = await remesaEn(e, 'tomada');
    const conRemesa = await cerrar(api, e.admin.token, e.jornadaId, saldosDe(e));
    expect(conRemesa.statusCode).toBe(409);
    expect(cuerpoError(conRemesa).mensaje).toContain('remesa(s) tomada(s)');

    await prisma.operacion.update({ where: { id: tomada.id }, data: { estado: 'completada' } });
    expect((await cerrar(api, e.admin.token, e.jornadaId, saldosDe(e))).statusCode).toBe(200);
  });

  it('la primera vez no hay contra qué comparar: queda cerrada, con la foto del día', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await cerrarTurno(e);

    const respuesta = await cerrar(api, e.admin.token, e.jornadaId, saldosDe(e));

    expect(respuesta.statusCode).toBe(200);
    const detalle = detalleDe(respuesta);
    expect(detalle.jornada).toMatchObject({ estado: 'cerrada', ciclo: 1 });
    expect(detalle.saldosReportados).toHaveLength(2);
    expect(detalle.saldosReportados.find((s) => s.cuenta.id === e.boveda)).toMatchObject({
      esperado: null,
      reportado: '1000000.00',
      diferencia: null,
      resultado: null,
    });
    // Disponible: la caja (conteo del turno), la bóveda y la billetera (lo reportado).
    expect(detalle.resumen.totalDisponible).toEqual([{ moneda: 'COP', total: '1660005.00' }]);
    expect(detalle.resumen.disponible.map((d) => d.origen).sort()).toEqual([
      'conteo_de_turno',
      'reportado',
      'reportado',
    ]);
    expect(detalle.eventos.map((ev) => ev.tipo)).toEqual(['cierre']);
    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'jornada.cerrar', entidadId: e.jornadaId },
    });
    expect(aTexto(registro.despues)).toContain('1000000.00');
  });

  it('el cierre queda como foto: lo que pase después no cambia el resumen', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await cerrarTurno(e);
    await cerrar(api, e.admin.token, e.jornadaId, saldosDe(e));

    await remesaEn(e, 'completada');
    const detalle = detalleDe(await ver(api, e.admin.token, e.jornadaId));

    expect(detalle.resumen.remesas.registradas).toBe(0);
  });

  it('el día siguiente se espera lo reportado más lo que se movió, y toda diferencia pide explicación', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await cerrarTurno(e);
    await cerrar(api, e.admin.token, e.jornadaId, saldosDe(e));
    const hoy = (await prisma.jornada.findUniqueOrThrow({ where: { id: e.jornadaId } })).fecha;
    const manana = await prisma.jornada.create({
      data: { sucursalId: e.sucursalId, fecha: new Date(hoy.getTime() + 24 * 3_600_000) },
    });
    await mover(e, e.boveda, 'entrada', '50000'); // un traslado a la bóveda

    const antes = detalleDe(await ver(api, e.admin.token, manana.id));
    expect(antes.cuentasPorArquear.find((c) => c.cuenta.id === e.boveda)?.esperado).toBe(
      '1050000.00',
    );
    expect(antes.cuentasPorArquear.find((c) => c.cuenta.id === e.billetera)?.esperado).toBe(
      '500000.00',
    );

    // Faltan 1.000 en la bóveda y no se explica: se rechaza y la jornada sigue abierta.
    const sinExplicar = await cerrar(
      api,
      e.admin.token,
      manana.id,
      saldosDe(e, { boveda: '1049000' }),
    );
    expect(sinExplicar.statusCode).toBe(400);
    expect((await prisma.jornada.findUniqueOrThrow({ where: { id: manana.id } })).estado).toBe(
      'abierta',
    );
    expect(await prisma.saldoCuentaJornada.count({ where: { jornadaId: manana.id } })).toBe(0);

    const explicado = await cerrar(api, e.admin.token, manana.id, {
      saldos: [
        {
          cuentaId: e.boveda,
          reportado: '1049000',
          explicacion: 'Pago de un domicilio en efectivo',
        },
        { cuentaId: e.billetera, reportado: '500000' },
      ],
    });

    expect(explicado.statusCode).toBe(200);
    const detalle = detalleDe(explicado);
    expect(detalle.saldosReportados.find((s) => s.cuenta.id === e.boveda)).toMatchObject({
      esperado: '1050000.00',
      reportado: '1049000.00',
      diferencia: '-1000.00',
      explicacion: 'Pago de un domicilio en efectivo',
      resultado: 'faltante',
    });
    expect(detalle.saldosReportados.find((s) => s.cuenta.id === e.billetera)).toMatchObject({
      diferencia: '0.00',
      resultado: 'cuadrado',
    });
  });

  it('exige reportar exactamente las cuentas que se arquean, con los decimales de la moneda', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await cerrarTurno(e);
    const probar = (cuerpo: unknown) => cerrar(api, e.admin.token, e.jornadaId, cuerpo);

    const sinBilletera = await probar({ saldos: [{ cuentaId: e.boveda, reportado: '1' }] });
    const conCaja = await probar({
      saldos: [...saldosDe(e).saldos, { cuentaId: e.efectivo, reportado: '1' }],
    });
    const repetida = await probar({
      saldos: [...saldosDe(e).saldos, { cuentaId: e.boveda, reportado: '1' }],
    });
    const decimales = await probar(saldosDe(e, { boveda: '10.555' }));
    const negativo = await probar(saldosDe(e, { boveda: '-5' }));

    for (const respuesta of [sinBilletera, conCaja, repetida, decimales, negativo]) {
      expect(respuesta.statusCode).toBe(400);
    }
    expect((await prisma.jornada.findUniqueOrThrow({ where: { id: e.jornadaId } })).estado).toBe(
      'abierta',
    );
  });

  it('una jornada cerrada no se cierra otra vez, y dos cierres a la vez cierran una sola vez', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await cerrarTurno(e);

    const [a, b] = await Promise.all([
      cerrar(api, e.admin.token, e.jornadaId, saldosDe(e)),
      cerrar(api, e.admin.token, e.jornadaId, saldosDe(e)),
    ]);
    const otra = await cerrar(api, e.admin.token, e.jornadaId, saldosDe(e));

    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect(otra.statusCode).toBe(409);
    expect(await prisma.saldoCuentaJornada.count({ where: { jornadaId: e.jornadaId } })).toBe(2);
    expect(await prisma.eventoJornada.count({ where: { jornadaId: e.jornadaId } })).toBe(1);
  });
});

describe('reabrir la jornada', () => {
  it('el administrador la reabre con motivo; al cerrarla de nuevo es otro ciclo', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await cerrarTurno(e);
    await cerrar(api, e.admin.token, e.jornadaId, saldosDe(e));

    const sinMotivo = await reabrir(api, e.admin.token, e.jornadaId, '');
    const abierta = await reabrir(api, e.admin.token, e.jornadaId, 'Faltó registrar un gasto');

    expect(sinMotivo.statusCode).toBe(400);
    expect(abierta.statusCode).toBe(200);
    expect(detalleDe(abierta).jornada).toMatchObject({ estado: 'abierta', ciclo: 1 });
    // Nada se borra: lo reportado en el primer cierre sigue guardado.
    expect(await prisma.saldoCuentaJornada.count({ where: { jornadaId: e.jornadaId } })).toBe(2);

    const segundo = await cerrar(
      api,
      e.admin.token,
      e.jornadaId,
      saldosDe(e, { boveda: '1200000' }),
    );

    expect(segundo.statusCode).toBe(200);
    const detalle = detalleDe(segundo);
    expect(detalle.jornada).toMatchObject({ estado: 'cerrada', ciclo: 2 });
    expect(detalle.saldosReportados.find((s) => s.cuenta.id === e.boveda)?.reportado).toBe(
      '1200000.00',
    );
    expect(detalle.eventos.map((ev) => ev.tipo)).toEqual(['cierre', 'reapertura', 'cierre']);
    expect(detalle.eventos[1]?.motivo).toBe('Faltó registrar un gasto');
    expect(await prisma.saldoCuentaJornada.count({ where: { jornadaId: e.jornadaId } })).toBe(4);
    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { accion: 'jornada.reabrir', entidadId: e.jornadaId },
    });
    expect(aTexto(registro.despues)).toContain('Faltó registrar un gasto');
  });

  it('solo se reabre una jornada cerrada', async () => {
    const e = await escenario();

    const respuesta = await reabrir(nuevaApp(), e.admin.token, e.jornadaId, 'No está cerrada');

    expect(respuesta.statusCode).toBe(409);
    expect((await reabrir(nuevaApp(), e.admin.token, randomUUID(), 'No existe')).statusCode).toBe(
      404,
    );
  });

  it('con la jornada cerrada nadie abre turno; reabierta, sí', async () => {
    const e = await escenario();
    const api = nuevaApp();
    await cerrarTurno(e);
    await cerrar(api, e.admin.token, e.jornadaId, saldosDe(e));
    const abrir = () =>
      llamar(api, 'POST', '/turnos', {
        token: e.vendedor.token,
        cuerpo: { cajaId: e.cajaId, conteos: [{ moneda: 'COP', lineas: [] }] },
      });

    const cerrada = await abrir();
    await reabrir(api, e.admin.token, e.jornadaId, 'Se vuelve a vender');
    const abierta = await abrir();

    expect(cerrada.statusCode).toBe(409);
    expect(cuerpoError(cerrada).mensaje).toContain('jornada de hoy ya está cerrada');
    expect(abierta.statusCode).toBe(201);
  });
});
