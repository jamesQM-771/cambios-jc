import type { FastifyInstance } from 'fastify';

import type { ProveedorZod } from '../../plugins/validacion-zod.js';

import { esquemaConsultaAuditoria, respuestaAuditoria } from './esquemas.js';
import type { ServicioAuditoria } from './servicio.js';

export function rutasAuditoria(app: FastifyInstance, servicio: ServicioAuditoria): void {
  app.withTypeProvider<ProveedorZod>().get(
    '/auditoria',
    {
      config: { permiso: 'auditoria.ver' },
      schema: { querystring: esquemaConsultaAuditoria, response: { 200: respuestaAuditoria } },
    },
    (request) => servicio.consultar(request.query),
  );
}
