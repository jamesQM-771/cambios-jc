import { describe, expect, it } from 'vitest';

import { leerConfig } from './config.js';

const BASE = 'postgresql://usuario:clave@localhost:5432/base';

describe('leerConfig', () => {
  it('con solo DATABASE_URL usa los valores por defecto', () => {
    expect(leerConfig({ DATABASE_URL: BASE })).toEqual({
      NODE_ENV: 'development',
      PUERTO_API: 3000,
      HOST_API: '127.0.0.1',
      ORIGEN_WEB: 'http://localhost:5173',
      DATABASE_URL: BASE,
      CONFIAR_PROXY: false,
      RATE_LIMIT_MAX: 100,
      RATE_LIMIT_VENTANA_SEGUNDOS: 60,
      LOG_NIVEL: 'info',
    });
  });

  it('convierte los números y el booleano que llegan como texto', () => {
    const config = leerConfig({
      DATABASE_URL: BASE,
      PUERTO_API: '4000',
      RATE_LIMIT_MAX: '5',
      CONFIAR_PROXY: 'true',
    });

    expect(config.PUERTO_API).toBe(4000);
    expect(config.RATE_LIMIT_MAX).toBe(5);
    expect(config.CONFIAR_PROXY).toBe(true);
  });

  it('sin DATABASE_URL falla y dice cuál variable falta', () => {
    expect(() => leerConfig({})).toThrow(/DATABASE_URL/);
  });

  it.each([
    ['PUERTO_API', '0'],
    ['PUERTO_API', 'abc'],
    ['ORIGEN_WEB', 'no-es-una-url'],
    ['RATE_LIMIT_MAX', '-1'],
    ['CONFIAR_PROXY', 'quizas'],
    ['LOG_NIVEL', 'ruidoso'],
  ])('rechaza %s = "%s"', (variable, valor) => {
    expect(() => leerConfig({ DATABASE_URL: BASE, [variable]: valor })).toThrow(
      new RegExp(variable),
    );
  });
});
