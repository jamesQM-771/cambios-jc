import { createInterface } from 'node:readline/promises';

import { crearPrisma } from './lib/prisma.js';
import { ErrorRestablecerAdmin, restablecerAdministrador } from './lib/restablecer-admin.js';

/**
 * Script de emergencia (se corre en el servidor): `npm run admin:restablecer -w @cambios-jc/api -- <login>`.
 * Ver README, sección "Recuperar el acceso de un administrador".
 */
const login = process.argv[2];
if (!login) {
  console.error('Uso: npm run admin:restablecer -w @cambios-jc/api -- <login-del-administrador>');
  process.exit(1);
}

const lector = createInterface({ input: process.stdin, output: process.stdout });
const confirmacion = await lector.question(
  `Se restablecerá el acceso de "${login}" (contraseña temporal nueva y 2FA reiniciado).\n` +
    'Escribe el login otra vez para confirmar: ',
);
lector.close();

const prisma = crearPrisma();
try {
  const { contrasenaTemporal } = await restablecerAdministrador(prisma, { login, confirmacion });
  console.log('\nListo. Entrega esta contraseña temporal en persona; no se vuelve a mostrar:\n');
  console.log(`  ${contrasenaTemporal}\n`);
  console.log('Al entrar tendrá que cambiarla y configurar el 2FA de nuevo.');
} catch (error) {
  console.error(error instanceof ErrorRestablecerAdmin ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
