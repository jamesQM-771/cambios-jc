import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { urlBasePruebas } from './base-pruebas.js';

/**
 * Setup global de Vitest: reinicia la base de pruebas y aplica todas las migraciones.
 * Con CONSERVAR_BASE_PRUEBAS=1 no reinicia nada y usa la base tal como está (debe estar migrada):
 * sirve para repetir pruebas rápido; `npm run check` siempre parte de una base limpia.
 */
export default function prepararBase(): void {
  const url = urlBasePruebas();
  if (process.env.CONSERVAR_BASE_PRUEBAS === '1') return;

  const dirApi = fileURLToPath(new URL('..', import.meta.url));
  execFileSync('npx', ['prisma', 'migrate', 'reset', '--force'], {
    cwd: dirApi,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
}
