import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { crearPrisma } from '../src/lib/prisma.js';
import { sembrar } from '../src/lib/sembrar.js';

const archivoEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv);

const prisma = crearPrisma();
try {
  const resultado = await sembrar(prisma, {
    loginAdmin: process.env.ADMIN_LOGIN_INICIAL ?? '',
    contrasenaAdmin: process.env.ADMIN_CONTRASENA_INICIAL ?? '',
  });
  console.log('Datos iniciales:', resultado);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
