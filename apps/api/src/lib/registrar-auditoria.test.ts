import { randomUUID } from 'node:crypto';

import { Decimal } from '@cambios-jc/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { cerrarApp, crearAppPrueba } from '../../test/ayudas.js';
import type { ProveedorZod } from '../plugins/validacion-zod.js';

import { crearPrisma, type PrismaClient } from './prisma.js';
import { registrarAuditoria, sanearParaAuditoria, VALOR_OCULTO } from './registrar-auditoria.js';
import { sembrar } from './sembrar.js';

let prisma: PrismaClient;

beforeAll(() => {
  prisma = crearPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Acción única por prueba, para no mezclar registros entre pruebas. */
const accionUnica = () => `prueba.${randomUUID()}`;

describe('registrarAuditoria', () => {
  it('guarda quién, qué, sobre qué entidad, el antes y el después', async () => {
    const accion = accionUnica();
    await registrarAuditoria(prisma, {
      accion,
      entidad: 'empresa',
      entidadId: 'abc',
      antes: { nombre: 'Antes' },
      despues: { nombre: 'Después' },
      ip: '10.0.0.5',
      agenteUsuario: 'Navegador de prueba',
    });

    const fila = await prisma.auditoria.findFirstOrThrow({ where: { accion } });
    expect(fila).toMatchObject({
      entidad: 'empresa',
      entidadId: 'abc',
      antes: { nombre: 'Antes' },
      despues: { nombre: 'Después' },
      ip: '10.0.0.5',
      agenteUsuario: 'Navegador de prueba',
      usuarioId: null,
    });
    expect(fila.fecha).toBeInstanceOf(Date);
  });

  it('oculta contraseñas, hashes y secretos 2FA, también anidados', async () => {
    const accion = accionUnica();
    await registrarAuditoria(prisma, {
      accion,
      entidad: 'usuario',
      despues: {
        login: 'vendedor1',
        hashContrasena: '$argon2id$v=19$m=65536',
        contrasena: 'clave-secreta-1',
        anidado: { secreto2fa: 'JBSWY3DPEHPK3PXP', codigo2fa: '654321', rol: 'vendedor' },
      },
    });

    const fila = await prisma.auditoria.findFirstOrThrow({ where: { accion } });
    expect(fila.despues).toEqual({
      login: 'vendedor1',
      hashContrasena: VALOR_OCULTO,
      contrasena: VALOR_OCULTO,
      anidado: { secreto2fa: VALOR_OCULTO, codigo2fa: VALOR_OCULTO, rol: 'vendedor' },
    });
    expect(JSON.stringify(fila.despues)).not.toMatch(/argon2|clave-secreta|JBSWY3|654321/);
  });

  it('convierte BigInt, Decimal y fechas a JSON sin perder valor', () => {
    const resultado = sanearParaAuditoria({
      id: 10n,
      monto: new Decimal('1.50'),
      fecha: new Date('2026-01-01T00:00:00Z'),
    });

    expect(resultado).toEqual({ id: '10', monto: '1.5', fecha: '2026-01-01T00:00:00.000Z' });
  });

  it('sin datos no guarda antes ni después', async () => {
    const accion = accionUnica();
    await registrarAuditoria(prisma, { accion, entidad: 'sesion' });

    const fila = await prisma.auditoria.findFirstOrThrow({ where: { accion } });
    expect(fila.antes).toBeNull();
    expect(fila.despues).toBeNull();
  });

  it('dentro de una transacción se deshace junto con el cambio', async () => {
    const accion = accionUnica();
    await expect(
      prisma.$transaction(async (tx) => {
        await registrarAuditoria(tx, { accion, entidad: 'prueba' });
        throw new Error('deshacer todo');
      }),
    ).rejects.toThrow('deshacer todo');

    expect(await prisma.auditoria.count({ where: { accion } })).toBe(0);
  });

  it('dentro de una transacción confirmada queda guardado', async () => {
    const accion = accionUnica();
    await prisma.$transaction(async (tx) => {
      await registrarAuditoria(tx, { accion, entidad: 'prueba' });
    });

    expect(await prisma.auditoria.count({ where: { accion } })).toBe(1);
  });
});

describe('request.auditar', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await cerrarApp(app);
    app = undefined;
  });

  it('completa usuario, IP y dispositivo con los datos de la petición', async () => {
    // La bitácora tiene clave foránea al usuario: se necesita un usuario real en la base.
    const login = `auditoria-${randomUUID().slice(0, 8)}`;
    await sembrar(prisma, { loginAdmin: login, contrasenaAdmin: 'clave-de-prueba-123' });
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { login } });
    const accion = accionUnica();

    app = crearAppPrueba({
      prisma: crearPrisma(),
      resolverUsuario: () =>
        Promise.resolve({ id: usuario.id, login, nombre: usuario.nombre, rol: 'administrador' }),
    });
    app.withTypeProvider<ProveedorZod>().post(
      '/prueba/auditar',
      {
        config: { acceso: 'autenticado' },
        schema: { response: { 200: z.object({ ok: z.boolean() }) } },
      },
      async (peticion) => {
        await peticion.auditar({ accion, entidad: 'prueba', despues: { valor: 1 } });
        return { ok: true };
      },
    );

    const respuesta = await app.inject({
      method: 'POST',
      url: '/prueba/auditar',
      headers: { 'user-agent': 'agente-de-prueba' },
    });

    expect(respuesta.statusCode).toBe(200);
    const fila = await prisma.auditoria.findFirstOrThrow({ where: { accion } });
    expect(fila).toMatchObject({
      usuarioId: usuario.id,
      ip: '127.0.0.1',
      agenteUsuario: 'agente-de-prueba',
      despues: { valor: 1 },
    });
  });
});
