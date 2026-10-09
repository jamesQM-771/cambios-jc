import { MONEDAS, type Moneda } from '@cambios-jc/shared';
import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const MONEDAS_SOPORTADAS = Object.keys(MONEDAS) as [Moneda, ...Moneda[]];
const esquemaMoneda = z.enum(MONEDAS_SOPORTADAS);
const esquemaClase = z.enum(['remesa', 'divisa_caja']);

const esquemaNombre = z.string().trim().min(2, 'Escribe el nombre de la línea.').max(100);

// Un porcentaje (ej. "11" = 11 %), sin el signo %. Hasta 6 decimales (DECIMALES_TASA).
const esquemaMargen = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, 'Escribe un porcentaje positivo, sin el signo % (ejemplo: 11).');

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

// El modo y el margen se configuran aparte (permiso margen.configurar), no al crear ni al editar
// el nombre: cambia con menos frecuencia y lo decide el dueño, no quien da de alta la línea.
export const esquemaConfigurarTasaLinea = z.discriminatedUnion('modoTasa', [
  z.object({ modoTasa: z.literal('directo') }),
  z.object({
    modoTasa: z.literal('porcentaje'),
    margenVenta: esquemaMargen,
    margenCompra: esquemaMargen.optional(),
  }),
]);

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
  modoTasa: z.enum(['directo', 'porcentaje']),
  margenCompra: z.string().nullable(),
  margenVenta: z.string().nullable(),
  creadoEn: z.date(),
});

export type LineaNegocioPublica = z.infer<typeof esquemaLineaNegocioPublica>;

export const respuestaLineaNegocio = z.object({ lineaNegocio: esquemaLineaNegocioPublica });

export const respuestaListaLineasNegocio = z.object({
  lineasNegocio: z.array(esquemaLineaNegocioPublica),
});
