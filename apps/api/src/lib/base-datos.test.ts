import { ROLES } from '@cambios-jc/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearPrisma, type PrismaClient } from './prisma.js';

let prisma: PrismaClient;

beforeAll(() => {
  prisma = crearPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('roles', () => {
  it('el enum "rol" de la base coincide con ROLES de shared', async () => {
    const filas = await prisma.$queryRaw<{ etiqueta: string }[]>`
      SELECT e.enumlabel AS etiqueta
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'rol'
      ORDER BY e.enumsortorder`;

    expect(filas.map((fila) => fila.etiqueta).sort()).toEqual([...ROLES].sort());
  });
});

describe('auditoria es de solo inserción', () => {
  let id: bigint;

  beforeAll(async () => {
    const fila = await prisma.auditoria.create({
      data: { accion: 'prueba.insertar', entidad: 'prueba', despues: { valor: 1 } },
    });
    id = fila.id;
  });

  it('permite insertar', async () => {
    expect(await prisma.auditoria.findUnique({ where: { id } })).not.toBeNull();
  });

  it('rechaza UPDATE', async () => {
    await expect(
      prisma.$executeRaw`UPDATE auditoria SET accion = 'alterada' WHERE id = ${id}`,
    ).rejects.toThrow(/solo inserción/);
  });

  it('rechaza DELETE', async () => {
    await expect(prisma.$executeRaw`DELETE FROM auditoria WHERE id = ${id}`).rejects.toThrow(
      /solo inserción/,
    );
  });

  it('rechaza TRUNCATE', async () => {
    await expect(prisma.$executeRaw`TRUNCATE auditoria`).rejects.toThrow(/solo inserción/);
  });

  it('rechaza la actualización también desde Prisma', async () => {
    await expect(
      prisma.auditoria.update({ where: { id }, data: { accion: 'alterada' } }),
    ).rejects.toThrow();
    const fila = await prisma.auditoria.findUnique({ where: { id } });
    expect(fila?.accion).toBe('prueba.insertar');
  });
});

describe('empresa tiene una sola fila', () => {
  beforeAll(async () => {
    if (!(await prisma.empresa.findUnique({ where: { unica: true } }))) {
      await prisma.empresa.create({ data: { nombre: 'Empresa de prueba' } });
    }
  });

  it('rechaza una segunda empresa', async () => {
    await expect(prisma.empresa.create({ data: { nombre: 'Otra empresa' } })).rejects.toThrow();
  });

  it('rechaza una empresa con unica = false', async () => {
    await expect(
      prisma.empresa.create({ data: { nombre: 'Otra empresa', unica: false } }),
    ).rejects.toThrow();
    expect(await prisma.empresa.count()).toBe(1);
  });
});
