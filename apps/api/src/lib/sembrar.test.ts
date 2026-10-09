import { randomUUID } from 'node:crypto';

import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BANCOS_VENEZUELA } from './bancos-venezuela.js';
import { DENOMINACIONES_SEMILLA } from './denominaciones-semilla.js';
import { crearPrisma, type PrismaClient } from './prisma.js';
import { sembrar } from './sembrar.js';

let prisma: PrismaClient;

beforeAll(() => {
  prisma = crearPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Valores de prueba generados en cada corrida; no son credenciales reales.
const loginUnico = () => `admin-prueba-${randomUUID().slice(0, 8)}`;
const contrasena = 'clave-de-prueba-123';

describe('sembrar', () => {
  it('crea empresa, sucursal y administrador con contraseña cifrada con argon2', async () => {
    const login = loginUnico();
    const resultado = await sembrar(prisma, { loginAdmin: login, contrasenaAdmin: contrasena });

    expect(resultado.administradorCreado).toBe(true);
    expect(await prisma.empresa.count()).toBe(1);
    expect(await prisma.sucursal.findUnique({ where: { nombre: 'Principal' } })).not.toBeNull();

    const admin = await prisma.usuario.findUniqueOrThrow({ where: { login } });
    expect(admin.rol).toBe('administrador');
    expect(admin.debeCambiarContrasena).toBe(true);
    expect(admin.tiene2fa).toBe(false);
    expect(admin.hashContrasena).not.toContain(contrasena);
    expect(admin.hashContrasena.startsWith('$argon2id$')).toBe(true);
    expect(await argon2.verify(admin.hashContrasena, contrasena)).toBe(true);
  });

  it('registra la creación en la bitácora sin el hash ni la contraseña', async () => {
    const login = loginUnico();
    await sembrar(prisma, { loginAdmin: login, contrasenaAdmin: contrasena });
    const admin = await prisma.usuario.findUniqueOrThrow({ where: { login } });
    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { entidad: 'usuario', entidadId: admin.id },
    });

    expect(registro.accion).toBe('seed.crear');
    const texto = JSON.stringify(registro.despues);
    expect(texto).not.toContain(contrasena);
    expect(texto).not.toContain('argon2');
  });

  it('ejecutarlo dos veces no duplica ni cambia la contraseña', async () => {
    const login = loginUnico();
    await sembrar(prisma, { loginAdmin: login, contrasenaAdmin: contrasena });
    const antes = await prisma.usuario.findUniqueOrThrow({ where: { login } });

    const segunda = await sembrar(prisma, {
      loginAdmin: login,
      contrasenaAdmin: 'otra-clave-distinta',
    });

    expect(segunda).toMatchObject({
      empresaCreada: false,
      sucursalCreada: false,
      administradorCreado: false,
      bancosCreados: 0,
      denominacionesCreadas: 0,
      lineasNegocioCreadas: 0,
    });
    expect(await prisma.usuario.count({ where: { login } })).toBe(1);
    expect(await prisma.empresa.count()).toBe(1);
    const despues = await prisma.usuario.findUniqueOrThrow({ where: { login } });
    expect(despues.hashContrasena).toBe(antes.hashContrasena);
  });

  it('rechaza una contraseña de menos de 10 caracteres', async () => {
    await expect(
      sembrar(prisma, { loginAdmin: loginUnico(), contrasenaAdmin: 'corta1234' }),
    ).rejects.toThrow(/al menos 10 caracteres/);
  });

  it('rechaza un login vacío', async () => {
    await expect(
      sembrar(prisma, { loginAdmin: '  ', contrasenaAdmin: contrasena }),
    ).rejects.toThrow(/vacío/);
  });

  it('siembra el catálogo de bancos de Venezuela, sin el 0001 (banco central), sin duplicar', async () => {
    await sembrar(prisma, { loginAdmin: loginUnico(), contrasenaAdmin: contrasena });
    const antes = await prisma.banco.count({
      where: { codigo: { in: BANCOS_VENEZUELA.map((b) => b.codigo) } },
    });

    await sembrar(prisma, { loginAdmin: loginUnico(), contrasenaAdmin: contrasena });

    // No se compara el total de la tabla: otras pruebas del módulo de bancos crean las suyas.
    const despues = await prisma.banco.count({
      where: { codigo: { in: BANCOS_VENEZUELA.map((b) => b.codigo) } },
    });
    expect(antes).toBe(27);
    expect(despues).toBe(27);
    expect(await prisma.banco.findUnique({ where: { codigo: '0001' } })).toBeNull();
    expect(await prisma.banco.findUnique({ where: { codigo: '0102' } })).toMatchObject({
      nombre: 'Banco de Venezuela',
      pais: 'VE',
      activo: true,
    });
  });

  it('siembra las denominaciones de COP, USD y VES, sin duplicar', async () => {
    // No se compara el total de la tabla: otras pruebas del módulo de denominaciones crean las
    // suyas. Se cuentan solo las filas exactas de la semilla (OR de moneda+valor).
    const sonDeLaSemilla = {
      OR: DENOMINACIONES_SEMILLA.map((d) => ({ moneda: d.moneda, valor: Number(d.valor) })),
    };

    await sembrar(prisma, { loginAdmin: loginUnico(), contrasenaAdmin: contrasena });
    const antes = await prisma.denominacion.count({ where: sonDeLaSemilla });

    await sembrar(prisma, { loginAdmin: loginUnico(), contrasenaAdmin: contrasena });

    const despues = await prisma.denominacion.count({ where: sonDeLaSemilla });
    expect(antes).toBe(DENOMINACIONES_SEMILLA.length);
    expect(despues).toBe(DENOMINACIONES_SEMILLA.length);
    const billeteCien = await prisma.denominacion.findFirst({
      where: { moneda: 'COP', valor: 100000 },
    });
    expect(billeteCien).toMatchObject({ activa: true });
  });

  it('siembra las 3 líneas de negocio de Cambios JC, con "Bolívares en efectivo" desactivada', async () => {
    await sembrar(prisma, { loginAdmin: loginUnico(), contrasenaAdmin: contrasena });
    await sembrar(prisma, { loginAdmin: loginUnico(), contrasenaAdmin: contrasena });

    expect(
      await prisma.lineaNegocio.count({
        where: {
          nombre: { in: ['Transferencias a Venezuela', 'Dólares', 'Bolívares en efectivo'] },
        },
      }),
    ).toBe(3);
    expect(
      await prisma.lineaNegocio.findUnique({ where: { nombre: 'Transferencias a Venezuela' } }),
    ).toMatchObject({ clase: 'remesa', monedaOrigen: 'COP', monedaDestino: 'VES', activa: true });
    expect(await prisma.lineaNegocio.findUnique({ where: { nombre: 'Dólares' } })).toMatchObject({
      clase: 'divisa_caja',
      monedaOrigen: 'USD',
      monedaDestino: 'COP',
      activa: true,
    });
    expect(
      await prisma.lineaNegocio.findUnique({ where: { nombre: 'Bolívares en efectivo' } }),
    ).toMatchObject({ activa: false });
  });
});
