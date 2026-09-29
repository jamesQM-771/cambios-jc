import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// Librerías prohibidas por CLAUDE.md §4.
const importsProhibidos = {
  paths: [
    { name: 'moment', message: 'Prohibido (CLAUDE.md §4). Usa Date o Intl.' },
    { name: 'redux', message: 'Prohibido (CLAUDE.md §4). Usa TanStack Query o estado local.' },
    { name: 'react-redux', message: 'Prohibido (CLAUDE.md §4).' },
    { name: 'zustand', message: 'Prohibido (CLAUDE.md §4).' },
    { name: 'tailwindcss', message: 'Prohibido (CLAUDE.md §4). Usa tokens CSS.' },
  ],
  patterns: [
    { group: ['@reduxjs/*', 'zustand/*', 'moment/*'], message: 'Prohibido (CLAUDE.md §4).' },
    { group: ['@mui/*', '@material-ui/*'], message: 'Prohibido (CLAUDE.md §4).' },
  ],
};

export default defineConfig(
  { ignores: ['**/dist/', '**/coverage/', '**/node_modules/', 'apps/api/src/generated/'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-restricted-imports': ['error', importsProhibidos],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  prettier,
);
