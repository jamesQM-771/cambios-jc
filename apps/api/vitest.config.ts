import { defineProject } from 'vitest/config';

import { urlBasePruebas } from './test/base-pruebas.js';

export default defineProject({
  test: {
    name: 'api',
    environment: 'node',
    // Arrancar Fastify tarda ~1 s por prueba; con la caché fría y todos los paquetes en
    // paralelo puede superar los 5 s por defecto. Las pruebas con base de datos también lo necesitan.
    testTimeout: 15_000,
    // Reinicia la base de pruebas y aplica las migraciones una vez por corrida.
    globalSetup: ['./test/preparar-base.ts'],
    // Todas las pruebas usan la base de pruebas, nunca la de desarrollo.
    env: { DATABASE_URL: urlBasePruebas() },
    // Los archivos comparten la base: se ejecutan uno tras otro.
    fileParallelism: false,
  },
});
