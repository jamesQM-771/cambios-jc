import type { FastifyInstance } from 'fastify';

import type { ProveedorZod } from '../../plugins/validacion-zod.js';

import { esquemaCodigo, respuestaSeguimiento } from './esquemas.js';
import type { ServicioSeguimiento } from './servicio.js';

export function rutasSeguimiento(app: FastifyInstance, servicio: ServicioSeguimiento): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/seguimiento/:codigo',
    {
      // Sin sesión: la abre el cliente final con el código de su recibo. El límite por IP evita que
      // se pueda recorrer el espacio de códigos (60 bits) probando uno por uno.
      config: { acceso: 'publico', rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { params: esquemaCodigo, response: { 200: respuestaSeguimiento } },
    },
    async (request, respuesta) => {
      const seguimiento = await servicio.consultar(request.params.codigo);
      // Es información de una persona concreta: que ningún proxy ni navegador la guarde.
      return respuesta.header('cache-control', 'no-store').send({ seguimiento });
    },
  );
}
