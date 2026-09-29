import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Devuelve la URL de la base de pruebas (DATABASE_URL_PRUEBAS del .env o del entorno de CI).
 * Se niega a devolver una base cuyo nombre no termine en "_pruebas": las pruebas la reinician
 * por completo y nunca deben tocar la base de desarrollo.
 */
export function urlBasePruebas(): string {
  const archivoEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv);

  const url = process.env.DATABASE_URL_PRUEBAS;
  if (!url) {
    throw new Error(
      'Falta DATABASE_URL_PRUEBAS: las pruebas de integración necesitan PostgreSQL (ver README).',
    );
  }
  const nombreBase = new URL(url).pathname.slice(1);
  if (!nombreBase.endsWith('_pruebas')) {
    throw new Error(
      `La base de pruebas debe terminar en "_pruebas" y es "${nombreBase}". No se reinicia.`,
    );
  }
  return url;
}
