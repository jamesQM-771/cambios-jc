import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json'],
      include: ['apps/*/src/**', 'packages/*/src/**'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/generated/**',
        'apps/api/test/**',
        'apps/web/src/pruebas/**',
        'apps/*/src/**/*.d.ts',
      ],
    },
  },
});
