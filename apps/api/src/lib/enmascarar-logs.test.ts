import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { capturarLogs, cerrarApp, crearAppPrueba } from '../../test/ayudas.js';
import type { ProveedorZod } from '../plugins/validacion-zod.js';

import { enmascararTexto, enmascararValor } from './enmascarar-logs.js';

describe('enmascararTexto', () => {
  it.each([
    ['0102 0241 8100 0016 4441', '0102 **** **** **** 4441'],
    ['01020241810000164441', '0102 **** **** **** 4441'],
    ['0102-0241-8100-0016-4441', '0102 **** **** **** 4441'],
    ['Pago a 01020241810000164441 hoy', 'Pago a 0102 **** **** **** 4441 hoy'],
  ])('%s', (entrada, esperado) => {
    expect(enmascararTexto(entrada)).toBe(esperado);
  });

  it('no toca números que no son una cuenta de 20 dígitos', () => {
    for (const texto of ['0102024181000016444', '010202418100001644411', 'COP 162000', '3.76']) {
      expect(enmascararTexto(texto)).toBe(texto);
    }
  });
});

describe('enmascararValor', () => {
  it('recorre objetos y listas anidados', () => {
    expect(
      enmascararValor({ a: ['01020241810000164441'], b: { c: 'x 01020241810000164441' }, d: 5 }),
    ).toEqual({
      a: ['0102 **** **** **** 4441'],
      b: { c: 'x 0102 **** **** **** 4441' },
      d: 5,
    });
  });

  it('deja intactas las instancias de clases (peticiones, errores, fechas)', () => {
    const error = new Error('01020241810000164441');
    const fecha = new Date('2026-01-01T00:00:00Z');
    const resultado = enmascararValor({ error, fecha }) as { error: Error; fecha: Date };

    expect(resultado.error).toBe(error);
    expect(resultado.fecha).toBe(fecha);
  });
});

describe('logs de la API', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await cerrarApp(app);
    app = undefined;
  });

  it('no escriben contraseñas, códigos 2FA, cédulas ni cuentas completas', async () => {
    const logs = capturarLogs();
    app = crearAppPrueba({ config: { LOG_NIVEL: 'info' }, streamLogs: logs.stream });
    app.withTypeProvider<ProveedorZod>().get(
      '/prueba/log',
      {
        config: { acceso: 'publico' },
        schema: { response: { 200: z.object({ ok: z.boolean() }) } },
      },
      (peticion) => {
        peticion.log.info(
          {
            contrasena: 'secreta-123',
            codigo2fa: '987654',
            cedula: 'V12345678',
            cuenta: '01020241810000164441',
            detalle: { numeroCuenta: '0102 0241 8100 0016 4441' },
            nota: 'Pago a 0102 0241 8100 0016 4441',
          },
          'Cuenta 01020241810000164441 consultada',
        );
        return { ok: true };
      },
    );

    // La cuenta también viaja en la URL: la línea "incoming request" no debe mostrarla.
    await app.inject({ method: 'GET', url: '/prueba/log?cuenta=01020241810000164441' });
    const texto = logs.texto();

    expect(texto).toContain('Cuenta 0102 **** **** **** 4441 consultada');
    expect(texto).toContain('[OCULTO]');
    for (const secreto of [
      'secreta-123',
      '987654',
      'V12345678',
      '01020241810000164441',
      '0102 0241 8100 0016 4441',
      '8100 0016',
    ]) {
      expect(texto, secreto).not.toContain(secreto);
    }
  });

  it('enmascaran las cuentas que aparecen en el mensaje de un error', async () => {
    const logs = capturarLogs();
    app = crearAppPrueba({ config: { LOG_NIVEL: 'info' }, streamLogs: logs.stream });
    app.withTypeProvider<ProveedorZod>().get(
      '/prueba/falla',
      {
        config: { acceso: 'publico' },
        schema: { response: { 200: z.object({ ok: z.boolean() }) } },
      },
      () => {
        throw new Error('No se pudo pagar a la cuenta 01020241810000164441');
      },
    );

    await app.inject({ method: 'GET', url: '/prueba/falla' });
    const texto = logs.texto();

    expect(texto).toContain('No se pudo pagar a la cuenta 0102 **** **** **** 4441');
    expect(texto).not.toContain('01020241810000164441');
  });
});
