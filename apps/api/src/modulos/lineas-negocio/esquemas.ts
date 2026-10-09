import { MONEDAS, type Moneda } from '@cambios-jc/shared';
import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const MONEDAS_SOPORTADAS = Object.keys(MONEDAS) as [Moneda, ...Moneda[]];
const esquemaMoneda = z.enum(MONEDAS_SOPORTADAS);
const esquemaClase = z.enum(['remesa', 'divisa_caja']);

const esquemaNombre = z.string().trim().min(2, 'Escribe el nombre de la línea.').max(100);

export const esquemaCrearLineaNegocio = z.object({
  nombre: esquemaNombre,
  clase: esquemaClase,
  monedaOrigen: esquemaMoneda,
  monedaDestino: esquemaMoneda,
});

// Solo el nombre: cambiar la clase o las monedas de una línea ya en uso (con tasas, en la tarea 1.6)
// sería peligroso. Para otra combinación se crea una línea nueva y se desactiva la anterior.
export const esquemaEditarLineaNegocio = z.object({
  nombre: esquemaNombre,
});

export const esquemaListarLineasNegocio = z.object({
  clase: esquemaClase.optional(),
  activa: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
});

export const esquemaLineaNegocioPublica = z.object({
  id: z.string(),
  nombre: z.string(),
  clase: esquemaClase,
  monedaOrigen: z.string(),
  monedaDestino: z.string(),
  activa: z.boolean(),
  creadoEn: z.date(),
});

export type LineaNegocioPublica = z.infer<typeof esquemaLineaNegocioPublica>;

export const respuestaLineaNegocio = z.object({ lineaNegocio: esquemaLineaNegocioPublica });

export const respuestaListaLineasNegocio = z.object({
  lineasNegocio: z.array(esquemaLineaNegocioPublica),
});
