import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const PUERTO_WEB = '5184';

/**
 * Pruebas de extremo a extremo (fase 2, tarea 2.10): el recorrido de una remesa con navegador real,
 * la API compilada y la base de PRUEBAS. No forman parte de `npm run check` (necesitan un navegador
 * y compilar antes): se corren con `npm run e2e` desde la raíz.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  // Un solo recorrido, en orden: cada paso depende del anterior (la remesa creada por el vendedor
  // la paga el digitador y la consulta el cliente).
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PUERTO_WEB}`,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    // Opcional: un Chromium ya instalado en el equipo (por ejemplo, en un contenedor sin descargas).
    ...(process.env.CHROMIUM_RUTA
      ? { launchOptions: { executablePath: process.env.CHROMIUM_RUTA } }
      : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  globalSetup: './preparar-entorno.ts',
  webServer: {
    command: 'node e2e/lanzar.mjs',
    cwd: raiz,
    url: `http://localhost:${PUERTO_WEB}/seguimiento`,
    // El arranque en este equipo es lento (D81): margen amplio.
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
