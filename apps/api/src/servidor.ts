import { construirApp } from './app.js';

const puerto = Number(process.env.PUERTO_API ?? 3000);
const host = process.env.HOST_API ?? '127.0.0.1';

const app = construirApp();

try {
  await app.listen({ port: puerto, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
