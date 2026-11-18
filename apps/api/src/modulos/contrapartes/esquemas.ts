import { TIPOS_CONTRAPARTE, TIPOS_MOVIMIENTO_CONTRAPARTE } from '@cambios-jc/shared';
import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .transform((valor) => (valor === '' ? null : valor))
    .nullable()
    .optional();

export const esquemaCrearContraparte = z
  .object({
    nombre: z.string().trim().min(2, 'Escribe el nombre de la contraparte.').max(80),
    tipo: z.enum(TIPOS_CONTRAPARTE),
    documento: textoOpcional(30),
    telefono: textoOpcional(30),
    notas: textoOpcional(500),
  })
  .strict();

export type DatosCrearContraparte = z.infer<typeof esquemaCrearContraparte>;

export const esquemaEditarContraparte = esquemaCrearContraparte
  .partial()
  .extend({ activa: z.boolean().optional() })
  .strict();

export type DatosEditarContraparte = z.infer<typeof esquemaEditarContraparte>;

export const esquemaListarContrapartes = z.object({
  busqueda: z.string().trim().max(80).optional(),
  tipo: z.enum(TIPOS_CONTRAPARTE).optional(),
  activa: z
    .enum(['true', 'false'])
    .transform((valor) => valor === 'true')
    .optional(),
  /** Solo las que tienen algún saldo a favor (`me_deben`) o en contra (`les_debo`). */
  saldo: z.enum(['me_deben', 'les_debo']).optional(),
});

const monto = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/, 'Escribe el monto como un número con hasta 3 decimales.')
  .refine((valor) => /[1-9]/.test(valor), 'El monto debe ser mayor que cero.');

export const esquemaRegistrarMovimiento = z
  .object({
    claveIdempotencia: z.uuid(),
    tipo: z.enum(TIPOS_MOVIMIENTO_CONTRAPARTE),
    moneda: z.enum(['COP', 'VES', 'USD']),
    monto,
    /** Solo para "ajuste" y "otro": 1 = me debe más (o le debo menos), -1 = le debo más (o me debe menos). */
    signo: z.union([z.literal(1), z.literal(-1)]).optional(),
    /** Cuenta del negocio por donde se movió el dinero; sin cuenta es solo reconocimiento de deuda. */
    cuentaId: z.uuid().optional(),
    nota: z.string().trim().max(300).optional(),
  })
  .strict();

export type DatosRegistrarMovimiento = z.infer<typeof esquemaRegistrarMovimiento>;

export const esquemaAnularMovimiento = z
  .object({ motivo: z.string().trim().min(3, 'Explica por qué se anula.').max(300) })
  .strict();

/** Saldo de una moneda: positivo = me debe, negativo = le debo (la pantalla solo muestra etiquetas). */
const esquemaSaldo = z.object({ moneda: z.string(), saldo: z.string() });

export const esquemaContrapartePublica = z.object({
  id: z.string(),
  nombre: z.string(),
  tipo: z.enum(TIPOS_CONTRAPARTE),
  documento: z.string().nullable(),
  telefono: z.string().nullable(),
  notas: z.string().nullable(),
  activa: z.boolean(),
  creadoEn: z.date(),
  saldos: z.array(esquemaSaldo),
  /** Cuentas del negocio a nombre de esta persona (§5.9). */
  cuentasTitular: z.array(z.object({ id: z.string(), nombre: z.string(), moneda: z.string() })),
});

export type ContrapartePublica = z.infer<typeof esquemaContrapartePublica>;

export const esquemaMovimientoPublico = z.object({
  id: z.string(),
  tipo: z.enum(TIPOS_MOVIMIENTO_CONTRAPARTE),
  moneda: z.string(),
  monto: z.string(),
  signo: z.union([z.literal(1), z.literal(-1)]),
  cuenta: z.object({ id: z.string(), nombre: z.string() }).nullable(),
  nota: z.string().nullable(),
  /** Movimiento que este anula (si es una anulación). */
  revierteId: z.string().nullable(),
  /** Anulación de este movimiento, si la tiene. */
  anulacion: z
    .object({
      id: z.string(),
      motivo: z.string().nullable(),
      por: z.object({ id: z.string(), nombre: z.string() }),
      en: z.date(),
    })
    .nullable(),
  compraId: z.string().nullable(),
  usuario: z.object({ id: z.string(), nombre: z.string() }),
  creadoEn: z.date(),
});

export type MovimientoPublico = z.infer<typeof esquemaMovimientoPublico>;

export const respuestaContraparte = z.object({ contraparte: esquemaContrapartePublica });
export const respuestaListaContrapartes = z.object({
  contrapartes: z.array(esquemaContrapartePublica),
});
export const respuestaDetalleContraparte = z.object({
  contraparte: esquemaContrapartePublica,
  movimientos: z.array(esquemaMovimientoPublico),
});
export const respuestaMovimiento = z.object({ movimiento: esquemaMovimientoPublico });

/** Totales de todas las contrapartes, por moneda (§5.16 B). */
export const respuestaResumenContrapartes = z.object({
  resumen: z.array(z.object({ moneda: z.string(), meDeben: z.string(), lesDebo: z.string() })),
});

export const respuestaOpcionesContraparte = z.object({
  contrapartes: z.array(
    z.object({ id: z.string(), nombre: z.string(), tipo: z.enum(TIPOS_CONTRAPARTE) }),
  ),
  cuentas: z.array(
    z.object({
      id: z.string(),
      nombre: z.string(),
      tipo: z.enum(['caja', 'banco', 'billetera']),
      moneda: z.string(),
    }),
  ),
});
