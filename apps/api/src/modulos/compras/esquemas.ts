import { esFechaValida } from '@cambios-jc/shared';
import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const dia = z.string().refine(esFechaValida, 'Usa el formato AAAA-MM-DD con una fecha que exista.');

export const esquemaRegistrarCompra = z
  .object({
    claveIdempotencia: z.uuid(),
    contraparteId: z.uuid(),
    /** Cuenta en la divisa comprada donde entraron (ej. una cuenta VES). */
    cuentaDestinoId: z.uuid(),
    cantidad: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,3})?$/, 'Escribe la cantidad como un número con hasta 3 decimales.')
      .refine((valor) => /[1-9]/.test(valor), 'La cantidad debe ser mayor que cero.'),
    /** Punto de compra: pesos por unidad, hasta 6 decimales. */
    tasa: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,6})?$/, 'Escribe la tasa como un número con hasta 6 decimales.')
      .refine((valor) => /[1-9]/.test(valor), 'La tasa debe ser mayor que cero.'),
    formaPago: z.enum(['contado', 'credito']),
    /** Cuenta en pesos de la que sale el pago; solo de contado. */
    cuentaPagoId: z.uuid().optional(),
    nota: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((datos) => datos.formaPago === 'credito' || datos.cuentaPagoId !== undefined, {
    message: 'Elige la cuenta de la que sale el pago.',
    path: ['cuentaPagoId'],
  })
  .refine((datos) => datos.formaPago === 'contado' || datos.cuentaPagoId === undefined, {
    message: 'Una compra a crédito no sale de ninguna cuenta.',
    path: ['cuentaPagoId'],
  });

export type DatosRegistrarCompra = z.infer<typeof esquemaRegistrarCompra>;

export const esquemaAnularCompra = z
  .object({ motivo: z.string().trim().min(3, 'Explica por qué se anula.').max(300) })
  .strict();

export const esquemaListarCompras = z.object({
  contraparteId: z.uuid().optional(),
  desde: dia.optional(),
  hasta: dia.optional(),
});

const resumen = z.object({ id: z.string(), nombre: z.string() });

export const esquemaCompraPublica = z.object({
  id: z.string(),
  contraparte: resumen,
  moneda: z.string(),
  cantidad: z.string(),
  tasa: z.string(),
  montoPesos: z.string(),
  cuentaDestino: resumen,
  formaPago: z.enum(['contado', 'credito']),
  cuentaPago: resumen.nullable(),
  nota: z.string().nullable(),
  creadoPor: resumen,
  creadoEn: z.date(),
  anulado: z.object({ por: resumen, en: z.date(), motivo: z.string() }).nullable(),
});

export type CompraPublica = z.infer<typeof esquemaCompraPublica>;

export const respuestaCompra = z.object({ compra: esquemaCompraPublica });
export const respuestaListaCompras = z.object({ compras: z.array(esquemaCompraPublica) });

export const respuestaOpcionesCompra = z.object({
  monedaLocal: z.string(),
  contrapartes: z.array(
    z.object({
      id: z.string(),
      nombre: z.string(),
      /** Saldo en moneda local: positivo = me debe (por ejemplo, un anticipo sin entregar). */
      saldoLocal: z.string(),
    }),
  ),
  cuentasDestino: z.array(
    z.object({
      id: z.string(),
      nombre: z.string(),
      moneda: z.string(),
      contraparteTitularId: z.string().nullable(),
    }),
  ),
  cuentasPago: z.array(z.object({ id: z.string(), nombre: z.string(), moneda: z.string() })),
});
