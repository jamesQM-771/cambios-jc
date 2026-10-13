import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

// El dinero y las tasas viajan como texto, sin separador de miles (CLAUDE.md §6).
const decimal = (maximoDecimales: number, mensaje: string) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^\\d+(\\.\\d{1,${String(maximoDecimales)}})?$`), mensaje)
    .refine((valor) => /[1-9]/.test(valor), 'El valor debe ser mayor que cero.');

const FORMAS_PAGO = ['efectivo', 'transferencia'] as const;

export const ESTADOS_OPERACION = [
  'registrada',
  'pago_verificado',
  'en_cola',
  'tomada',
  'completada',
  'con_incidencia',
  'devuelta',
  'anulada',
] as const;

export const esquemaRegistrarRemesa = z
  .object({
    /** La genera la pantalla al abrir el formulario; un reintento la repite y no duplica la remesa. */
    claveIdempotencia: z.uuid(),
    lineaNegocioId: z.uuid(),
    remitenteId: z.uuid(),
    medioPagoId: z.uuid(),
    formaPago: z.enum(FORMAS_PAGO),
    cuentaIngresoId: z.uuid(),
    /** Pesos que entregó el cliente. Se manda este o `montoBolivares`, no los dos. */
    montoPesos: decimal(2, 'Escribe los pesos como un número con hasta 2 decimales.').optional(),
    /** Bolívares que debe recibir el beneficiario ("a la inversa", §5.3). */
    montoBolivares: decimal(
      3,
      'Escribe los bolívares como un número con hasta 3 decimales.',
    ).optional(),
    /** Cambio de tasa en esta remesa: solo con permiso y siempre con motivo (§5.2). */
    tasaManual: z
      .object({
        tasa: decimal(6, 'Escribe la tasa como un número con hasta 6 decimales.'),
        motivo: z.string().trim().min(3, 'Explica por qué cambias la tasa.').max(300),
      })
      .optional(),
  })
  .refine((datos) => (datos.montoPesos === undefined) !== (datos.montoBolivares === undefined), {
    message: 'Indica los pesos o los bolívares, no los dos.',
    path: ['montoPesos'],
  });

export type DatosRegistrarRemesa = z.infer<typeof esquemaRegistrarRemesa>;

export const esquemaAnularRemesa = z.object({
  motivo: z.string().trim().min(3, 'Explica por qué se anula.').max(300),
});

/** El vendedor corrige a dónde se paga una remesa que quedó con incidencia (§8). */
export const esquemaCorregirRemesa = z.object({
  medioPagoId: z.uuid(),
  nota: z.string().trim().max(300).optional(),
});

export const esquemaHistorialRemesa = z.object({
  estadoAnterior: z.enum(ESTADOS_OPERACION).nullable(),
  estadoNuevo: z.enum(ESTADOS_OPERACION),
  motivo: z.string().nullable(),
  usuario: z.object({ id: z.string(), nombre: z.string() }),
  creadoEn: z.date(),
});

export type EventoRemesa = z.infer<typeof esquemaHistorialRemesa>;

export const respuestaHistorialRemesa = z.object({ historial: z.array(esquemaHistorialRemesa) });

export const esquemaListarRemesas = z.object({
  estado: z.enum(ESTADOS_OPERACION).optional(),
});

const esquemaPersona = z.object({
  id: z.string(),
  tipoDocumento: z.string(),
  numeroDocumento: z.string(),
  nombre: z.string(),
});

export const esquemaRemesaPublica = z.object({
  id: z.string(),
  numeroComprobante: z.number().int(),
  /** Con este código el cliente consulta su envío sin sesión (§5.15). */
  codigoSeguimiento: z.string(),
  estado: z.enum(ESTADOS_OPERACION),
  formaPago: z.enum(FORMAS_PAGO),
  lineaNegocio: z.object({ id: z.string(), nombre: z.string() }),
  remitente: esquemaPersona,
  beneficiario: z.object({
    cliente: esquemaPersona,
    medioPagoId: z.string(),
    tipo: z.enum(['cuenta_bancaria', 'pago_movil']),
    banco: z.object({ codigo: z.string(), nombre: z.string() }),
    numeroCuenta: z.string().nullable(),
    telefonoPagoMovil: z.string().nullable(),
    titular: z.string(),
    tipoDocumentoTitular: z.string(),
    numeroDocumentoTitular: z.string(),
  }),
  cuentaIngreso: z.object({ id: z.string(), nombre: z.string() }),
  montoPesos: z.string(),
  montoBolivares: z.string(),
  tasaCalculada: z.string(),
  tasaUsada: z.string(),
  motivoTasa: z.string().nullable(),
  /** Lo que pasó con el pago al beneficiario: quién lo tomó y qué cargó al completarlo. */
  pago: z.object({
    operador: z.object({ id: z.string(), nombre: z.string() }).nullable(),
    tomadaEn: z.date().nullable(),
    cuentaOrigen: z.object({ id: z.string(), nombre: z.string() }).nullable(),
    referenciaBancaria: z.string().nullable(),
    costoBancario: z.string().nullable(),
    tieneComprobante: z.boolean(),
    completadaEn: z.date().nullable(),
  }),
  creadoPor: z.object({ id: z.string(), nombre: z.string() }),
  creadoEn: z.date(),
});

export type RemesaPublica = z.infer<typeof esquemaRemesaPublica>;

export const respuestaRemesa = z.object({ remesa: esquemaRemesaPublica });

/**
 * Lo que necesita el formulario de una remesa y quien vende no puede pedir en Configuración (que
 * exige `empresa.configurar`): líneas de remesas con su tasa vigente y cuentas donde entra el dinero.
 */
export const esquemaOpcionesRemesa = z.object({
  lineas: z.array(
    z.object({
      id: z.string(),
      nombre: z.string(),
      monedaOrigen: z.string(),
      monedaDestino: z.string(),
      /** Tasa de venta vigente; `null` si todavía no se publicó una. */
      tasaVenta: z.string().nullable(),
    }),
  ),
  cuentasIngreso: z.array(
    z.object({
      id: z.string(),
      nombre: z.string(),
      tipo: z.enum(['caja', 'banco', 'billetera']),
      moneda: z.string(),
    }),
  ),
});

export type OpcionesRemesa = z.infer<typeof esquemaOpcionesRemesa>;
export const respuestaListaRemesas = z.object({ remesas: z.array(esquemaRemesaPublica) });
