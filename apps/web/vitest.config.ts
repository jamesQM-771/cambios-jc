import { fileURLToPath } from 'node:url';

import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: {
    alias: {
      '@cambios-jc/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['./src/pruebas/preparar.ts'],
    css: false,
    // Con todo el monorepo corriendo en paralelo, jsdom tarda en arrancar y la pantalla en dibujarse.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
