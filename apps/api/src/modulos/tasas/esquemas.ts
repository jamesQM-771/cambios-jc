import { esFechaValida } from '@cambios-jc/shared';
import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const dia = z.string().refine(esFechaValida, 'Usa el formato AAAA-MM-DD con una fecha que exista.');

// El dinero y las tasas viajan como texto, sin separador de miles (D3).
const esquemaDecimal = (mensaje: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,6})?$/, mensaje);

const esquemaTasaReferencia = esquemaDecimal(
  'Escribe la tasa del proveedor: un número positivo (ejemplo: 4.68).',
);
const esquemaTasaCompraOVenta = esquemaDecimal(
  'Escribe un número positivo, sin separador de miles (ejemplo: 3000 o 4.68).',
);
const esquemaMotivo = z.string().trim().max(300).optional();

// La forma del cuerpo depende del modo de tasa de la línea (D64): el cliente ya lo conoce porque
// lo lee en GET /lineas-negocio, y el servidor igual valida que coincida con el modo real de la línea.
export const esquemaPublicarTasa = z.discriminatedUnion('modoTasa', [
  z.object({
    modoTasa: z.literal('porcentaje'),
    lineaNegocioId: z.uuid(),
    tasaReferencia: esquemaTasaReferencia,
    motivo: esquemaMotivo,
  }),
  z.object({
    modoTasa: z.literal('directo'),
    lineaNegocioId: z.uuid(),
    tasaVenta: esquemaTasaCompraOVenta,
    tasaCompra: esquemaTasaCompraOVenta.optional(),
    motivo: esquemaMotivo,
  }),
]);

export const esquemaListarTasas = z.object({
  lineaNegocioId: z.uuid().optional(),
  vigente: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
  desde: dia.optional(),
  hasta: dia.optional(),
});

export const esquemaTasaPublica = z.object({
  id: z.string(),
  lineaNegocioId: z.string(),
  lineaNegocioNombre: z.string(),
  tasaReferencia: z.string().nullable(),
  margenUsado: z.string().nullable(),
  tasaCompra: z.string().nullable(),
  tasaVenta: z.string(),
  publicadaPorId: z.string(),
  publicadaPorNombre: z.string(),
  motivo: z.string().nullable(),
  vigenteDesde: z.date(),
  vigenteHasta: z.date().nullable(),
});

export type TasaPublica = z.infer<typeof esquemaTasaPublica>;

export const respuestaTasa = z.object({ tasa: esquemaTasaPublica });

export const respuestaListaTasas = z.object({ tasas: z.array(esquemaTasaPublica) });
