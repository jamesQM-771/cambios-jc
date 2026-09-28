import Fastify, { type FastifyInstance } from 'fastify';

// Construye la aplicación sin escuchar en un puerto, para poder probarla con inject().
// Plugins (errores, permisos, auditoría) y GET /salud se agregan en la tarea 0.6.
export function construirApp(): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.get('/', () => ({ nombre: 'Cambios JC API' }));

  return app;
}
