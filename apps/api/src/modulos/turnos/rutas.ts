import { tienePermiso } from '@cambios-jc/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { errores } from '../../lib/errores.js';
import type { ProveedorZod } from '../../plugins/validacion-zod.js';
import type { ContextoPeticion } from '../auth/servicio.js';

import {
  esquemaAbrirTurno,
  esquemaId,
  esquemaListarTurnos,
  esquemaOpcionesTurno,
  respuestaListaTurnos,
  respuestaTurno,
  respuestaTurnoActual,
} from './esquemas.js';
import type { ServicioTurnos } from './servicio.js';

const contextoDe = (request: FastifyRequest): ContextoPeticion => ({
  ip: request.ip,
  agenteUsuario: request.headers['user-agent'] ?? null,
});

const usuarioDe = (request: FastifyRequest) => {
  if (!request.usuario) throw errores.noAutenticado();
  return request.usuario;
};

const PROPIO = { permiso: 'turno.gestionar_propio' } as const;
/** Ver los turnos de todos es de quien cierra la jornada (el administrador). */
const DE_TODOS = { permiso: 'jornada.cerrar' } as const;

export function rutasTurnos(app: FastifyInstance, servicio: ServicioTurnos): void {
  const rutas = app.withTypeProvider<ProveedorZod>();

  rutas.get(
    '/turnos/opciones',
    { config: PROPIO, schema: { response: { 200: esquemaOpcionesTurno } } },
    async (request) => servicio.opciones(usuarioDe(request).id),
  );

  rutas.get(
    '/turnos/actual',
    { config: PROPIO, schema: { response: { 200: respuestaTurnoActual } } },
    async (request) => ({ turno: await servicio.actual(usuarioDe(request).id) }),
  );

  rutas.post(
    '/turnos',
    { config: PROPIO, schema: { body: esquemaAbrirTurno, response: { 201: respuestaTurno } } },
    async (request, respuesta) => {
      const turno = await servicio.abrir(
        request.body,
        { id: usuarioDe(request).id },
        contextoDe(request),
      );
      return respuesta.status(201).send({ turno });
    },
  );

  rutas.get(
    '/turnos',
    {
      config: DE_TODOS,
      schema: { querystring: esquemaListarTurnos, response: { 200: respuestaListaTurnos } },
    },
    async (request) => ({ turnos: await servicio.listar(request.query) }),
  );

  rutas.get(
    '/turnos/:id',
    { config: PROPIO, schema: { params: esquemaId, response: { 200: respuestaTurno } } },
    async (request) => {
      const usuario = usuarioDe(request);
      const turno = await servicio.obtener(request.params.id);
      // Cada quien ve sus turnos; ver los de otros es de quien cierra la jornada.
      if (turno.usuario.id !== usuario.id && !tienePermiso(usuario.rol, 'jornada.cerrar')) {
        throw errores.noEncontrado('El turno no existe.');
      }
      return { turno };
    },
  );
}
