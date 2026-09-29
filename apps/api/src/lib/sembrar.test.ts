import { randomUUID } from 'node:crypto';

import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

    expect(segunda).toEqual({
      empresaCreada: false,
      sucursalCreada: false,
      administradorCreado: false,
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
});
