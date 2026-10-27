import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { entornoE2e } from './lanzar.mjs';

/**
 * Antes del recorrido: aplica las migraciones a la base de PRUEBAS y la deja con los datos que
 * necesita (personas, línea, tasa, cuentas y una sesión por rol). Nunca toca la base de desarrollo.
 */
export default function preparar(): void {
  const raiz = fileURLToPath(new URL('..', import.meta.url));
  const entorno = entornoE2e();
  // En Windows los .cmd solo se ejecutan con shell; los argumentos son fijos, no vienen de nadie.
  const opciones = { env: entorno, stdio: 'inherit', shell: true } as const;

  // La base de pruebas se rehace desde cero: las pruebas de integración dejan operaciones sueltas
  // (sin transferencia) que romperían el listado de remesas. Solo toca la base *_pruebas.
  execFileSync('npx', ['prisma', 'migrate', 'reset', '--force'], {
    ...opciones,
    cwd: join(raiz, 'apps', 'api'),
  });
  execFileSync('npx', ['tsx', 'e2e/preparar-datos.mts'], { ...opciones, cwd: raiz });
}
