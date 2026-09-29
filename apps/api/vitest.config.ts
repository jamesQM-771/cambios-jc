import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'api',
    environment: 'node',
    // Arrancar Fastify tarda ~1 s por prueba; con la caché fría y todos los paquetes en
    // paralelo puede superar los 5 s por defecto. Las pruebas con base de datos (0.4) también lo necesitan.
    testTimeout: 15_000,
  },
});
