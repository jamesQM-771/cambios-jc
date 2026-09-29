import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient, type Prisma } from '../generated/prisma/client.js';

/** Crea un cliente de Prisma conectado con el adaptador de PostgreSQL (Prisma 7). */
export function crearPrisma(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) throw new Error('Falta la variable de entorno DATABASE_URL.');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

export type { Prisma, PrismaClient };
