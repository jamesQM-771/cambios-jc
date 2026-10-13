import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

/**
 * Lo que el digitador ve de una transferencia (§5.4, D14): a quién pagar y cuántos bolívares.
 * Nunca pesos, tasa, ganancia ni datos del remitente: esta forma es la única que sale de la cola.
 * Mientras nadie la ha tomado solo se ve el banco y el monto; el resto aparece al tomarla.
 */
export const esquemaItemCola = z.object({
  id: z.string(),
  estado: z.enum(['en_cola', 'tomada']),
  /** Cuándo entró a la cola: la lista va de la más antigua a la más nueva. */
  enviadaEn: z.date(),
  montoBolivares: z.string(),
  tomadaPorMi: z.boolean(),
  pago: z.object({
    tipo: z.enum(['cuenta_bancaria', 'pago_movil']),
    banco: z.object({ codigo: z.string(), nombre: z.string() }),
    numeroCuenta: z.string().nullable(),
    telefonoPagoMovil: z.string().nullable(),
    titular: z.string().nullable(),
    tipoDocumentoTitular: z.string().nullable(),
    numeroDocumentoTitular: z.string().nullable(),
  }),
});

export type ItemCola = z.infer<typeof esquemaItemCola>;

export const respuestaCola = z.object({
  remesas: z.array(esquemaItemCola),
  /** Cuentas desde las que puede pagar (en la moneda destino), con la comisión que se propone. */
  cuentasOrigen: z.array(
    z.object({ id: z.string(), nombre: z.string(), comisionPorDefecto: z.string().nullable() }),
  ),
  /** La última que usó esta persona: se propone para pagar con un solo toque. */
  ultimaCuentaOrigenId: z.string().nullable(),
});

export type RespuestaCola = z.infer<typeof respuestaCola>;

export const respuestaItemCola = z.object({ remesa: esquemaItemCola });

export const respuestaResultadoCola = z.object({
  remesa: z.object({
    id: z.string(),
    estado: z.enum(['en_cola', 'tomada', 'completada', 'con_incidencia']),
  }),
});

export const esquemaIncidencia = z.object({
  motivo: z
    .string()
    .trim()
    .min(3, 'Cuenta qué pasó para que el vendedor lo pueda corregir.')
    .max(300),
});

/** Campos de texto del formulario con el que se completa una transferencia (junto a la captura). */
export const esquemaCompletarTransferencia = z.object({
  cuentaOrigenId: z.uuid('Elige la cuenta desde la que pagaste.'),
  referenciaBancaria: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{4,40}$/, 'La referencia tiene entre 4 y 40 letras o números.')
    .optional(),
  costoBancario: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/, 'El costo es un número con hasta 3 decimales.')
    .optional(),
});

export type DatosCompletar = z.infer<typeof esquemaCompletarTransferencia>;
