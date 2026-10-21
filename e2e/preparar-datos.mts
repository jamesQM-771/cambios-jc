// Deja la base de PRUEBAS lista para el recorrido de extremo a extremo y guarda en `.datos.json` lo
// que las pruebas necesitan: un token de sesión por rol y los nombres de las personas creadas.
//
// No pasa por el login (que tiene 2FA y ya está cubierto por las pruebas de la API y de la web):
// abre las sesiones directamente, como hacen las pruebas de integración.
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { crearPrisma } from '../apps/api/src/lib/prisma.js';
import { abrirSesion, asegurarEmpresa, crearUsuarioDePrueba } from '../apps/api/test/auth.js';
import { abrirTurnoDePrueba } from '../apps/api/test/turnos.js';

import { leerEnv } from './lanzar.mjs';

export interface DatosE2e {
  tokens: { administrador: string; vendedor: string; digitador: string };
  remitente: { nombre: string; documento: string };
  beneficiario: { nombre: string; documento: string; titular: string };
  cuentaOrigen: string;
  /** Tasa de venta publicada para la línea (la usa la prueba para calcular lo esperado). */
  tasa: string;
}

const env = leerEnv();
const url = env.DATABASE_URL_PRUEBAS ?? '';
if (!new URL(url).pathname.endsWith('_pruebas')) {
  throw new Error('Solo se prepara la base de datos *_pruebas.');
}

const prisma = crearPrisma(url);
const unico = randomUUID().slice(0, 6).toUpperCase();
const digitos = String(Date.now()).slice(-7);

try {
  await asegurarEmpresa(prisma);

  // Cada corrida empieza con la cola limpia: lo que quedó de corridas anteriores se anula (esto es
  // la base de pruebas; en la de desarrollo nada se borra ni se anula así).
  await prisma.operacion.updateMany({
    where: { estado: { in: ['registrada', 'pago_verificado', 'en_cola', 'tomada'] } },
    data: { estado: 'anulada' },
  });

  // Solo una línea de remesas activa: la del recorrido (otras pruebas dejan líneas en esta base).
  await prisma.lineaNegocio.updateMany({
    where: { clase: 'remesa', activa: true },
    data: { activa: false },
  });

  const [administrador, vendedor, digitador] = await Promise.all([
    crearUsuarioDePrueba(prisma, { rol: 'administrador' }),
    crearUsuarioDePrueba(prisma, { rol: 'vendedor' }),
    crearUsuarioDePrueba(prisma, { rol: 'digitador' }),
  ]);

  const sucursal = await prisma.sucursal.create({
    data: { nombre: `Sucursal E2E ${unico}`, ciudad: 'Cúcuta' },
  });
  const linea = await prisma.lineaNegocio.create({
    data: {
      nombre: `Remesas E2E ${unico}`,
      clase: 'remesa',
      monedaOrigen: 'COP',
      monedaDestino: 'VES',
    },
  });
  await prisma.tasa.create({
    data: { lineaNegocioId: linea.id, tasaVenta: '3.760000', publicadaPorId: administrador.id },
  });
  const caja = await prisma.cuentaDinero.create({
    data: { nombre: `Caja E2E ${unico}`, tipo: 'caja', moneda: 'COP', sucursalId: sucursal.id },
  });
  // Desde la tarea 3.3 se vende dentro de un turno; la pantalla para abrirlo llega en la 3.9.
  await abrirTurnoDePrueba(prisma, { usuarioId: vendedor.id, cuentaCajaId: caja.id });
  const cuentaOrigen = `Banco VES E2E ${unico}`;
  await prisma.cuentaDinero.create({
    data: {
      nombre: cuentaOrigen,
      tipo: 'billetera',
      moneda: 'VES',
      sucursalId: sucursal.id,
      comisionPorDefecto: '1.500',
    },
  });
  const banco = await prisma.banco.upsert({
    where: { codigo: '9300' },
    update: { activo: true },
    create: { codigo: '9300', nombre: 'Banco E2E' },
  });

  const remitente = await prisma.cliente.create({
    data: {
      tipoDocumento: 'CC',
      numeroDocumento: `35${digitos}`,
      nombre: `Ana Gómez E2E ${unico}`,
      creadoPorId: vendedor.id,
    },
  });
  const beneficiario = await prisma.cliente.create({
    data: {
      tipoDocumento: 'V',
      numeroDocumento: `45${digitos}`,
      nombre: `Pedro Beneficiario E2E ${unico}`,
      creadoPorId: vendedor.id,
    },
  });
  await prisma.medioPago.create({
    data: {
      clienteId: beneficiario.id,
      tipo: 'cuenta_bancaria',
      bancoId: banco.id,
      numeroCuenta: `9300${digitos}${'0'.repeat(9)}`,
      titular: `Pedro Titular E2E ${unico}`,
      tipoDocumentoTitular: 'V',
      numeroDocumentoTitular: `45${digitos}`,
    },
  });

  const datos: DatosE2e = {
    tokens: {
      administrador: await abrirSesion(prisma, administrador.id),
      vendedor: await abrirSesion(prisma, vendedor.id),
      digitador: await abrirSesion(prisma, digitador.id),
    },
    remitente: { nombre: remitente.nombre, documento: remitente.numeroDocumento },
    beneficiario: {
      nombre: beneficiario.nombre,
      documento: beneficiario.numeroDocumento,
      titular: `Pedro Titular E2E ${unico}`,
    },
    cuentaOrigen,
    tasa: '3.76',
  };
  writeFileSync(fileURLToPath(new URL('./.datos.json', import.meta.url)), JSON.stringify(datos));
  console.log('Datos de extremo a extremo listos.');
} finally {
  await prisma.$disconnect();
}
