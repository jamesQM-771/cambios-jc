import { esFechaValida } from '@cambios-jc/shared';
import { z } from 'zod';

const dia = z.string().refine(esFechaValida, 'Usa el formato AAAA-MM-DD con una fecha que exista.');

export const esquemaConsultaAuditoria = z
  .object({
    /** Día (zona horaria de la empresa) desde el cual se muestra, incluido. */
    desde: dia.optional(),
    /** Día (zona horaria de la empresa) hasta el cual se muestra, incluido. */
    hasta: dia.optional(),
    usuarioId: z.uuid().optional(),
    accion: z.string().trim().min(1).max(80).optional(),
    entidad: z.string().trim().min(1).max(60).optional(),
    entidadId: z.string().trim().min(1).max(80).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((consulta) => !consulta.desde || !consulta.hasta || consulta.desde <= consulta.hasta, {
    message: 'La fecha "desde" no puede ser posterior a "hasta".',
    path: ['desde'],
  });

export type ConsultaAuditoria = z.infer<typeof esquemaConsultaAuditoria>;

export const esquemaRegistroAuditoria = z.object({
  /** Número de la fila, como texto (puede superar lo que JavaScript representa con exactitud). */
  id: z.string(),
  fecha: z.date(),
  usuario: z.object({ id: z.string(), login: z.string(), nombre: z.string() }).nullable(),
  accion: z.string(),
  entidad: z.string(),
  entidadId: z.string().nullable(),
  antes: z.unknown(),
  despues: z.unknown(),
  ip: z.string().nullable(),
  agenteUsuario: z.string().nullable(),
});

export const respuestaAuditoria = z.object({
  registros: z.array(esquemaRegistroAuditoria),
  total: z.number().int(),
  pagina: z.number().int(),
  porPagina: z.number().int(),
});
