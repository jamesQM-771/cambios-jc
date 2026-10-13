import { z } from 'zod';

export const esquemaCodigo = z.object({ codigo: z.string().max(40) });

export const ESTADOS_SEGUIMIENTO = [
  'recibida',
  'en_proceso',
  'enviada',
  'en_revision',
  'anulada',
  'devuelta',
] as const;

/**
 * Lo único que ve quien consulta con su código (decisión 9 de la fase 2): en qué va su envío, los
 * bolívares y las fechas. Nunca cuenta, cédula, titular, pesos, tasa ni quién lo atendió. Esta forma
 * es la única que sale de la ruta pública: el esquema de salida descarta cualquier otro campo.
 */
export const esquemaSeguimiento = z.object({
  numeroComprobante: z.number().int(),
  estado: z.enum(ESTADOS_SEGUIMIENTO),
  mensaje: z.string(),
  montoBolivaresTexto: z.string(),
  fecha: z.date(),
  actualizadaEn: z.date(),
  empresa: z.object({ nombre: z.string(), zonaHoraria: z.string() }),
});

export type Seguimiento = z.infer<typeof esquemaSeguimiento>;

export const respuestaSeguimiento = z.object({ seguimiento: esquemaSeguimiento });
