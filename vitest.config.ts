import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json'],
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
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
