import type { FastifyInstance, FastifyRequest } from 'fastify';

import {
  registrarAuditoria,
  type ClienteAuditoria,
  type DatosAuditoria,
} from '../lib/registrar-auditoria.js';

/** Datos de auditoría que el servicio aporta; quién, IP y dispositivo los completa la petición. */
export type DatosAuditoriaPeticion = Omit<DatosAuditoria, 'usuarioId' | 'ip' | 'agenteUsuario'> & {
  usuarioId?: string | null;
};

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Registra una acción en la bitácora con el usuario, la IP y el dispositivo de la petición.
     * Pasa `cliente` (la transacción) para que se confirme o se deshaga junto con el cambio.
     */
    auditar: (datos: DatosAuditoriaPeticion, cliente?: ClienteAuditoria) => Promise<void>;
  }
}

export function instalarAuditoria(app: FastifyInstance, prisma: ClienteAuditoria): void {
  app.decorateRequest(
    'auditar',
    async function auditar(
      this: FastifyRequest,
      datos: DatosAuditoriaPeticion,
      cliente: ClienteAuditoria = prisma,
    ): Promise<void> {
      await registrarAuditoria(cliente, {
        ...datos,
        usuarioId: datos.usuarioId ?? this.usuario?.id ?? null,
        ip: this.ip,
        agenteUsuario: this.headers['user-agent'] ?? null,
      });
    },
  );
}
