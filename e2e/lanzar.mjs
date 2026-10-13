// Levanta lo que necesitan las pruebas de extremo a extremo: la API ya compilada (contra la base de
// PRUEBAS, nunca la de desarrollo) y la web. Playwright la arranca y la detiene.
//
// Requiere `npm run compilar` hecho antes (el script `npm run e2e` de la raíz lo hace).
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUERTO_API_E2E = '3011';
export const PUERTO_WEB_E2E = '5184';

const raiz = fileURLToPath(new URL('..', import.meta.url));

/** Variables del `.env` del repositorio (el archivo no se versiona: ver `.env.example`). */
export function leerEnv() {
  /** @type {Record<string, string>} */
  const env = {};
  for (const linea of readFileSync(join(raiz, '.env'), 'utf8').split(/\r?\n/)) {
    const partes = /^([A-Z0-9_]+)=(.*)$/.exec(linea);
    if (partes?.[1] !== undefined) env[partes[1]] = (partes[2] ?? '').trim();
  }
  return env;
}

/** Entorno de las pruebas: la base de pruebas, puertos propios y una carpeta de subidas temporal. */
export function entornoE2e() {
  const env = leerEnv();
  const urlPruebas = env.DATABASE_URL_PRUEBAS;
  if (!urlPruebas || !new URL(urlPruebas).pathname.endsWith('_pruebas')) {
    throw new Error('Las pruebas de extremo a extremo solo usan la base de datos *_pruebas.');
  }
  const subidas = join(tmpdir(), 'cambios-jc-e2e');
  mkdirSync(subidas, { recursive: true });
  return {
    ...process.env,
    ...env,
    NODE_ENV: 'development',
    DATABASE_URL: urlPruebas,
    PUERTO_API: PUERTO_API_E2E,
    PUERTO_WEB: PUERTO_WEB_E2E,
    ORIGEN_WEB: `http://localhost:${PUERTO_WEB_E2E}`,
    CARPETA_SUBIDAS: subidas,
    LOG_NIVEL: 'warn',
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const entorno = entornoE2e();
  const hijos = [
    spawn(process.execPath, ['dist/servidor.js'], {
      cwd: join(raiz, 'apps', 'api'),
      env: entorno,
      stdio: 'inherit',
    }),
    spawn(process.execPath, [join(raiz, 'node_modules', 'vite', 'bin', 'vite.js')], {
      cwd: join(raiz, 'apps', 'web'),
      env: entorno,
      stdio: 'inherit',
    }),
  ];
  const cerrar = () => {
    for (const hijo of hijos) hijo.kill();
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
  process.on('exit', cerrar);
}
