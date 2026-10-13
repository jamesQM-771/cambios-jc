import type { FastifyInstance } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';

import { esquemaId, respuestaRecibo } from './esquemas.js';
import type { ServicioRecibos } from './servicio.js';

export function rutasRecibos(app: FastifyInstance, servicio: ServicioRecibos): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  // POST y no GET: cada llamada deja una impresión registrada (el original y luego las COPIAS).
  rutas.post(
    '/remesas/:id/recibo',
    {
      config: { permiso: 'remesa.registrar' },
      schema: { params: esquemaId, response: { 200: respuestaRecibo } },
    },
    async (request) => {
      if (!request.usuario) throw errores.noAutenticado();
      return {
        recibo: await servicio.emitir(
          request.params.id,
          { id: request.usuario.id },
          { ip: request.ip, agenteUsuario: request.headers['user-agent'] ?? null },
        ),
      };
    },
  );
}
