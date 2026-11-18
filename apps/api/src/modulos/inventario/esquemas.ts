import { z } from 'zod';

export const esquemaMoneda = z.object({ moneda: z.enum(['VES', 'USD']) });

export const esquemaAjustarInventario = z
  .object({
    sentido: z.enum(['entrada', 'salida']),
    cantidad: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,3})?$/, 'Escribe la cantidad como un número con hasta 3 decimales.')
      .refine((valor) => /[1-9]/.test(valor), 'La cantidad debe ser mayor que cero.'),
    /** Obligatoria en una entrada (el inventario inicial o lo que faltaba): a qué costo entra. */
    tasa: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,6})?$/, 'Escribe la tasa como un número con hasta 6 decimales.')
      .refine((valor) => /[1-9]/.test(valor), 'La tasa debe ser mayor que cero.')
      .optional(),
    motivo: z.string().trim().min(3, 'Explica el ajuste.').max(300),
  })
  .strict()
  .refine((datos) => datos.sentido === 'salida' || datos.tasa !== undefined, {
    message: 'Una entrada necesita la tasa a la que se costea.',
    path: ['tasa'],
  });

export type DatosAjustarInventario = z.infer<typeof esquemaAjustarInventario>;

export const esquemaInventarioPublico = z.object({
  moneda: z.string(),
  /** Unidades compradas y aún no pagadas, según el inventario. */
  cantidad: z.string(),
  costoPromedio: z.string().nullable(),
  /** Lo que de verdad hay en las cuentas de esa moneda, según el libro (para comparar). */
  saldoCuentas: z.string(),
  actualizadoEn: z.date().nullable(),
});

export const esquemaMovimientoInventario = z.object({
  id: z.string(),
  origen: z.enum([
    'ajuste',
    'compra',
    'compra_anulacion',
    'remesa_pago',
    'divisa_compra',
    'divisa_venta',
    'divisa_anulacion',
  ]),
  sentido: z.enum(['entrada', 'salida']),
  cantidad: z.string(),
  tasa: z.string().nullable(),
  cantidadDespues: z.string(),
  costoDespues: z.string().nullable(),
  compraId: z.string().nullable(),
  operacion: z.object({ id: z.string(), numeroComprobante: z.number() }).nullable(),
  nota: z.string().nullable(),
  usuario: z.object({ id: z.string(), nombre: z.string() }),
  creadoEn: z.date(),
});

export const respuestaInventarios = z.object({ inventarios: z.array(esquemaInventarioPublico) });
export const respuestaInventario = z.object({ inventario: esquemaInventarioPublico });
export const respuestaMovimientosInventario = z.object({
  movimientos: z.array(esquemaMovimientoInventario),
});
