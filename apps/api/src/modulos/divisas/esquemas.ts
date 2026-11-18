import { esFechaValida } from '@cambios-jc/shared';
import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const dia = z.string().refine(esFechaValida, 'Usa el formato AAAA-MM-DD con una fecha que exista.');

const esquemaBillete = z
  .object({ denominacionId: z.uuid(), cantidad: z.number().int().positive().max(100_000) })
  .strict();

export const esquemaRegistrarDivisa = z
  .object({
    claveIdempotencia: z.uuid(),
    tipo: z.enum(['compra', 'venta']),
    lineaNegocioId: z.uuid(),
    /** Divisa que cambia de manos (ej. dólares), hasta 2 decimales. */
    montoDivisa: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, 'Escribe el monto como un número con hasta 2 decimales.')
      .refine((valor) => /[1-9]/.test(valor), 'El monto debe ser mayor que cero.'),
    /**
     * Billetes de la divisa: los que entrega el cliente (compra) o los que se le entregan (venta).
     * Deben sumar exactamente el monto.
     */
    billetes: z.array(esquemaBillete).min(1, 'Indica los billetes.').max(30),
    /** Tasa distinta a la publicada: solo con permiso y siempre con motivo (§5.2). */
    tasaManual: z
      .object({
        tasa: z
          .string()
          .trim()
          .regex(/^\d+(\.\d{1,6})?$/, 'Escribe la tasa con hasta 6 decimales.')
          .refine((valor) => /[1-9]/.test(valor), 'La tasa debe ser mayor que cero.'),
        motivo: z.string().trim().min(3, 'Explica por qué cambias la tasa.').max(200),
      })
      .strict()
      .optional(),
    clienteNombre: z.string().trim().max(100).optional(),
    clienteDocumento: z.string().trim().max(30).optional(),
  })
  .strict();

export type DatosRegistrarDivisa = z.infer<typeof esquemaRegistrarDivisa>;

export const esquemaAnularDivisa = z
  .object({ motivo: z.string().trim().min(3, 'Explica por qué se anula.').max(300) })
  .strict();

export const esquemaListarDivisas = z.object({
  desde: dia.optional(),
  hasta: dia.optional(),
});

const resumen = z.object({ id: z.string(), nombre: z.string() });

export const esquemaDivisaPublica = z.object({
  id: z.string(),
  numeroComprobante: z.number().int(),
  tipo: z.enum(['compra', 'venta']),
  lineaNegocio: resumen,
  moneda: z.string(),
  montoDivisa: z.string(),
  montoPesos: z.string(),
  tasaCalculada: z.string(),
  tasaUsada: z.string(),
  motivoTasa: z.string().nullable(),
  clienteNombre: z.string().nullable(),
  clienteDocumento: z.string().nullable(),
  turno: z.object({ id: z.string(), caja: resumen }),
  billetes: z.array(
    z.object({
      sentido: z.enum(['entrada', 'salida']),
      moneda: z.string(),
      valor: z.string(),
      cantidad: z.number().int(),
    }),
  ),
  /** Solo para quien tiene `ganancia.ver` y solo en ventas costeadas; si no, `null`. */
  ganancia: z.object({ costoPromedio: z.string(), ganancia: z.string() }).nullable(),
  creadoPor: resumen,
  creadoEn: z.date(),
  anulado: z.object({ por: resumen, en: z.date(), motivo: z.string() }).nullable(),
});

export type DivisaPublica = z.infer<typeof esquemaDivisaPublica>;

export const respuestaDivisa = z.object({ operacion: esquemaDivisaPublica });
export const respuestaListaDivisas = z.object({ operaciones: z.array(esquemaDivisaPublica) });

export const respuestaOpcionesDivisa = z.object({
  lineas: z.array(
    z.object({
      id: z.string(),
      nombre: z.string(),
      moneda: z.string(),
      monedaLocal: z.string(),
      tasaCompra: z.string().nullable(),
      tasaVenta: z.string().nullable(),
      denominaciones: z.array(z.object({ id: z.string(), valor: z.string() })),
    }),
  ),
  miTurno: z
    .object({
      id: z.string(),
      caja: resumen,
      /** Monedas que tiene la caja del turno (una cuenta de efectivo por moneda, D116). */
      monedas: z.array(z.string()),
    })
    .nullable(),
  puedeCambiarTasa: z.boolean(),
});

export const respuestaReciboDivisa = z.object({
  recibo: z.object({
    esCopia: z.boolean(),
    operacion: esquemaDivisaPublica,
    empresa: z.object({
      nombre: z.string(),
      nit: z.string().nullable(),
      whatsapp: z.string().nullable(),
      textoPie: z.string().nullable(),
      zonaHoraria: z.string(),
    }),
  }),
});
