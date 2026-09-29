import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { PrismaClient } from '../../lib/prisma.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';

const esquemaSalud = z.object({
  estado: z.enum(['ok', 'degradado']),
  api: z.literal('ok'),
  baseDatos: z.enum(['ok', 'caida']),
});

/** `GET /salud`: estado de la API y de la base de datos. Público y sin datos internos (versiones, rutas, errores). */
export function rutasSalud(app: FastifyInstance, prisma: Pick<PrismaClient, '$queryRaw'>): void {
  app.withTypeProvider<ProveedorZod>().get(
    '/salud',
    {
      config: { acceso: 'publico' },
      schema: { response: { 200: esquemaSalud, 503: esquemaSalud } },
    },
    async (request, respuesta) => {
      let baseDatos: 'ok' | 'caida' = 'ok';
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (error) {
        request.log.error({ err: error }, 'La base de datos no responde');
        baseDatos = 'caida';
      }
      const sana = baseDatos === 'ok';
      return respuesta
        .status(sana ? 200 : 503)
        .send({ estado: sana ? 'ok' : 'degradado', api: 'ok', baseDatos });
    },
  );
}
