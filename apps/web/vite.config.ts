import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Los puertos se leen del .env de la raíz del monorepo (el mismo que usa la API).
  const entorno = loadEnv(mode, fileURLToPath(new URL('../..', import.meta.url)), '');
  const puertoApi = Number(entorno.PUERTO_API ?? 3000);

  return {
    // El .env es el de la raíz del monorepo; Vite solo expone a la web las variables que empiezan con VITE_.
    envDir: fileURLToPath(new URL('../..', import.meta.url)),
    plugins: [react()],
    resolve: {
      // La web solo usa los tipos de `shared`, pero se resuelve a su código fuente (D31).
      alias: {
        '@cambios-jc/shared': fileURLToPath(
          new URL('../../packages/shared/src/index.ts', import.meta.url),
        ),
      },
    },
    server: {
      port: Number(entorno.PUERTO_WEB ?? 5173),
      strictPort: true,
      proxy: {
        // La web siempre habla con la API por el mismo origen (/api): la cookie de sesión
        // (sameSite=strict) funciona sin CORS. En producción lo hará el servidor web (fase 14).
        '/api': {
          target: `http://127.0.0.1:${String(puertoApi)}`,
          rewrite: (ruta: string) => ruta.replace(/^\/api/, ''),
        },
      },
    },
  };
});
