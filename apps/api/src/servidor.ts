import { construirApp } from './app.js';
import { leerConfig } from './lib/config.js';
import { crearPrisma } from './lib/prisma.js';
import { iniciarSentry } from './lib/sentry.js';

const config = leerConfig();
if (iniciarSentry(config.SENTRY_DSN, config.NODE_ENV)) console.log('Sentry activado.');
const app = construirApp({ config, prisma: crearPrisma(config.DATABASE_URL) });

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(senal, () => {
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ port: config.PUERTO_API, host: config.HOST_API });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
