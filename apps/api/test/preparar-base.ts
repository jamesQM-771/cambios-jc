import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { urlBasePruebas } from './base-pruebas.js';

/** Setup global de Vitest: reinicia la base de pruebas y aplica todas las migraciones. */
export default function prepararBase(): void {
  const url = urlBasePruebas();
  const dirApi = fileURLToPath(new URL('..', import.meta.url));
  execFileSync('npx', ['prisma', 'migrate', 'reset', '--force'], {
    cwd: dirApi,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
}
