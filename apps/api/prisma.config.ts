import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig, env } from 'prisma/config';

// Prisma 7 no lee .env por sí solo: se carga el .env de la raíz del monorepo si existe.
const archivoEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
