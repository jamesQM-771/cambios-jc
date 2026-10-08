import { MONEDAS, type Moneda } from '@cambios-jc/shared';
import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const MONEDAS_SOPORTADAS = Object.keys(MONEDAS) as [Moneda, ...Moneda[]];
const esquemaMoneda = z.enum(MONEDAS_SOPORTADAS);

// El dinero viaja como texto, sin separador de miles (D3). Hasta 3 decimales: alcanza para VES.
const esquemaValor = z
  .string()
  .trim()
  .regex(
    /^\d+(\.\d{1,3})?$/,
    'Escribe un número positivo, sin separador de miles (ejemplo: 50000 o 50000.5).',
  );

export const esquemaCrearDenominacion = z.object({
  moneda: esquemaMoneda,
  valor: esquemaValor,
});

export const esquemaEditarDenominacion = z.object({
  valor: esquemaValor,
});

export const esquemaListarDenominaciones = z.object({
  moneda: esquemaMoneda.optional(),
  activa: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
});

export const esquemaDenominacionPublica = z.object({
  id: z.string(),
  moneda: z.string(),
  /** Con los decimales propios de su moneda, como texto (D3): "50000.00", "1.000". */
  valor: z.string(),
  activa: z.boolean(),
  creadoEn: z.date(),
});

export type DenominacionPublica = z.infer<typeof esquemaDenominacionPublica>;

export const respuestaDenominacion = z.object({ denominacion: esquemaDenominacionPublica });

export const respuestaListaDenominaciones = z.object({
  denominaciones: z.array(esquemaDenominacionPublica),
});
