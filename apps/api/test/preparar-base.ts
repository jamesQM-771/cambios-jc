import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { urlBasePruebas } from './base-pruebas.js';

/**
 * Setup global de Vitest: deja la base de pruebas con todas las migraciones aplicadas.
 *
 * - Normal (`npm run check`): la reinicia por completo (borra y recrea las tablas).
 * - Con CONSERVAR_BASE_PRUEBAS=1: no borra nada; solo aplica las migraciones pendientes.
 *   Sirve para repetir pruebas rápido.
 */
export default function prepararBase(): void {
  const url = urlBasePruebas();
  const conservar = process.env.CONSERVAR_BASE_PRUEBAS === '1';
  const dirApi = fileURLToPath(new URL('..', import.meta.url));

  execFileSync(
    'npx',
    ['prisma', 'migrate', conservar ? 'deploy' : 'reset', ...(conservar ? [] : ['--force'])],
    {
      cwd: dirApi,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
      shell: process.platform === 'win32',
    },
  );
}
