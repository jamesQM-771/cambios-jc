import { describe, expect, it } from 'vitest';

import { leerConfig } from './config.js';

const BASE = 'postgresql://usuario:clave@localhost:5432/base';
const CLAVE = Buffer.alloc(32, 1).toString('base64');
const ENTORNO_MINIMO = { DATABASE_URL: BASE, CLAVE_CIFRADO_2FA: CLAVE };

describe('leerConfig', () => {
  it('con solo DATABASE_URL usa los valores por defecto', () => {
    expect(leerConfig(ENTORNO_MINIMO)).toEqual({
      NODE_ENV: 'development',
      PUERTO_API: 3000,
      HOST_API: '127.0.0.1',
      ORIGEN_WEB: 'http://localhost:5173',
      DATABASE_URL: BASE,
      CLAVE_CIFRADO_2FA: CLAVE,
      SESION_INACTIVIDAD_MINUTOS: 30,
      SESION_MAXIMA_HORAS: 12,
      SESION_PARCIAL_MINUTOS: 10,
      LOGIN_INTENTOS_MAXIMOS: 5,
      LOGIN_BLOQUEO_MINUTOS: 15,
      CONFIAR_PROXY: false,
      RATE_LIMIT_MAX: 100,
      RATE_LIMIT_VENTANA_SEGUNDOS: 60,
      LOG_NIVEL: 'info',
    });
  });

  it('convierte los números y el booleano que llegan como texto', () => {
    const config = leerConfig({
      ...ENTORNO_MINIMO,
      PUERTO_API: '4000',
      RATE_LIMIT_MAX: '5',
      CONFIAR_PROXY: 'true',
    });

    expect(config.PUERTO_API).toBe(4000);
    expect(config.RATE_LIMIT_MAX).toBe(5);
    expect(config.CONFIAR_PROXY).toBe(true);
  });

  it('sin DATABASE_URL falla y dice cuál variable falta', () => {
    expect(() => leerConfig({ CLAVE_CIFRADO_2FA: CLAVE })).toThrow(/DATABASE_URL/);
  });

  it('sin CLAVE_CIFRADO_2FA, o con una clave que no es de 32 bytes, falla', () => {
    expect(() => leerConfig({ DATABASE_URL: BASE })).toThrow(/CLAVE_CIFRADO_2FA/);
    expect(() => leerConfig({ DATABASE_URL: BASE, CLAVE_CIFRADO_2FA: 'corta' })).toThrow(
      /CLAVE_CIFRADO_2FA.*32 bytes/,
    );
  });

  it.each([
    ['PUERTO_API', '0'],
    ['PUERTO_API', 'abc'],
    ['ORIGEN_WEB', 'no-es-una-url'],
    ['RATE_LIMIT_MAX', '-1'],
    ['CONFIAR_PROXY', 'quizas'],
    ['LOG_NIVEL', 'ruidoso'],
    ['LOGIN_INTENTOS_MAXIMOS', '0'],
    ['SESION_MAXIMA_HORAS', 'siempre'],
  ])('rechaza %s = "%s"', (variable, valor) => {
    expect(() => leerConfig({ ...ENTORNO_MINIMO, [variable]: valor })).toThrow(
      new RegExp(variable),
    );
  });
});
