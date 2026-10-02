import { randomUUID } from 'node:crypto';

import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearPrisma, type PrismaClient } from './prisma.js';
import {
  ErrorRestablecerAdmin,
  ORIGEN_EMERGENCIA,
  restablecerAdministrador,
} from './restablecer-admin.js';

let prisma: PrismaClient;

beforeAll(() => {
  prisma = crearPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const loginUnico = (prefijo: string) => `${prefijo}-${randomUUID().slice(0, 8)}`;

async function crearUsuario(rol: 'administrador' | 'vendedor', cambios = {}) {
  return prisma.usuario.create({
    data: {
      login: loginUnico(rol),
      nombre: `Usuario ${rol} de prueba`,
      hashContrasena: await argon2.hash('contrasena-vieja-123'),
      debeCambiarContrasena: false,
      rol,
      tiene2fa: true,
      secreto2fa: 'secreto-cifrado-de-prueba',
      ultimoPaso2fa: 12345,
      ...cambios,
    },
  });
}

describe('restablecerAdministrador', () => {
  it('deja contraseña temporal nueva, 2FA reiniciado, usuario activo y sin bloqueo', async () => {
    const admin = await crearUsuario('administrador', {
      activo: false,
      intentosFallidos: 5,
      bloqueadoHasta: new Date(Date.now() + 60_000),
    });
    const sesion = await prisma.sesion.create({
      data: {
        usuarioId: admin.id,
        tokenHash: randomUUID(),
        completa: true,
        expiraEn: new Date(Date.now() + 3_600_000),
      },
    });

    const resultado = await restablecerAdministrador(prisma, {
      login: admin.login.toUpperCase(),
      confirmacion: ` ${admin.login} `,
    });

    expect(resultado.login).toBe(admin.login);
    const despues = await prisma.usuario.findUniqueOrThrow({ where: { id: admin.id } });
    expect(await argon2.verify(despues.hashContrasena, resultado.contrasenaTemporal)).toBe(true);
    expect(await argon2.verify(despues.hashContrasena, 'contrasena-vieja-123')).toBe(false);
    expect(despues).toMatchObject({
      debeCambiarContrasena: true,
      activo: true,
      tiene2fa: false,
      secreto2fa: null,
      ultimoPaso2fa: null,
      intentosFallidos: 0,
      bloqueadoHasta: null,
    });
    expect((await prisma.sesion.findUniqueOrThrow({ where: { id: sesion.id } })).revocada).toBe(
      true,
    );
  });

  it('deja un registro en la bitácora sin la contraseña ni usuario actor', async () => {
    const admin = await crearUsuario('administrador');

    const { contrasenaTemporal } = await restablecerAdministrador(prisma, {
      login: admin.login,
      confirmacion: admin.login,
    });

    const registro = await prisma.auditoria.findFirstOrThrow({
      where: { entidadId: admin.id, accion: 'usuario.restablecer_acceso_emergencia' },
    });
    expect(registro.usuarioId).toBeNull();
    expect(registro.agenteUsuario).toBe(ORIGEN_EMERGENCIA);
    expect(JSON.stringify([registro.antes, registro.despues])).not.toContain(contrasenaTemporal);
  });

  it('se niega con un usuario que no es administrador y no cambia nada', async () => {
    const vendedor = await crearUsuario('vendedor');

    await expect(
      restablecerAdministrador(prisma, { login: vendedor.login, confirmacion: vendedor.login }),
    ).rejects.toThrow(/no es administrador/);

    const despues = await prisma.usuario.findUniqueOrThrow({ where: { id: vendedor.id } });
    expect(despues.hashContrasena).toBe(vendedor.hashContrasena);
    expect(despues.tiene2fa).toBe(true);
  });

  it('se niega con un login que no existe', async () => {
    const login = loginUnico('fantasma');
    await expect(restablecerAdministrador(prisma, { login, confirmacion: login })).rejects.toThrow(
      ErrorRestablecerAdmin,
    );
  });

  it('se niega si la confirmación no coincide y no cambia nada', async () => {
    const admin = await crearUsuario('administrador');

    await expect(
      restablecerAdministrador(prisma, { login: admin.login, confirmacion: 'otro-login' }),
    ).rejects.toThrow(/confirmación/);

    const despues = await prisma.usuario.findUniqueOrThrow({ where: { id: admin.id } });
    expect(despues.hashContrasena).toBe(admin.hashContrasena);
    expect(despues.tiene2fa).toBe(true);
  });

  it('se niega con login vacío', async () => {
    await expect(
      restablecerAdministrador(prisma, { login: '  ', confirmacion: '  ' }),
    ).rejects.toThrow(/Indica el login/);
  });
});
