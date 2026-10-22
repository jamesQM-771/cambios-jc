import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

export const esquemaListarJornadas = z.object({
  sucursalId: z.uuid().optional(),
  estado: z.enum(['abierta', 'cerrada']).optional(),
});

/**
 * Cierre de la jornada (§5.16): el administrador reporta el saldo real de cada cuenta que no tiene
 * caja (bóveda, bancos y billeteras). El servidor lo compara con lo esperado; cualquier diferencia
 * lleva su explicación (D128).
 */
export const esquemaCerrarJornada = z
  .object({
    saldos: z
      .array(
        z.object({
          cuentaId: z.uuid(),
          reportado: z
            .string()
            .trim()
            .regex(/^\d+(\.\d{1,3})?$/, 'Escribe el saldo como un número con hasta 3 decimales.'),
          explicacion: z.string().trim().min(3).max(300).optional(),
        }),
      )
      .max(200),
  })
  .strict();

export type DatosCerrarJornada = z.infer<typeof esquemaCerrarJornada>;

export const esquemaReabrirJornada = z
  .object({ motivo: z.string().trim().min(3, 'Explica por qué se reabre.').max(300) })
  .strict();

const cuentaResumen = z.object({
  id: z.string(),
  nombre: z.string(),
  tipo: z.enum(['caja', 'banco', 'billetera']),
  moneda: z.string(),
});

const esquemaDisponible = z.object({
  cuenta: cuentaResumen,
  caja: z.object({ id: z.string(), nombre: z.string() }).nullable(),
  /** `null` cuando todavía no hay de dónde sacarlo (cuenta nunca arqueada). */
  saldo: z.string().nullable(),
  /** De dónde sale: el conteo de cierre de la caja, lo que reportó el administrador o lo esperado. */
  origen: z.enum(['conteo_de_turno', 'reportado', 'esperado', 'sin_dato']),
});

const porMoneda = z.array(z.object({ moneda: z.string(), total: z.string() }));

export const esquemaResumen = z.object({
  fecha: z.string(),
  sucursal: z.object({ id: z.string(), nombre: z.string() }),
  /** A. Dinero disponible al cerrar, cuenta por cuenta y consolidado. */
  disponible: z.array(esquemaDisponible),
  totalDisponible: porMoneda,
  /** C. Lo que pasó en el día. No incluye ganancia neta: necesita el costo promedio (fase 4). */
  remesas: z.object({
    registradas: z.number().int(),
    completadas: z.number().int(),
    anuladas: z.number().int(),
    devueltas: z.number().int(),
    /** Con incidencia o aún en curso al cerrar. */
    pendientes: z.number().int(),
  }),
  pesosRecibidos: porMoneda,
  devoluciones: porMoneda,
  costosBancarios: porMoneda,
  gastosOperativos: porMoneda,
  retirosDelDueno: porMoneda,
  traslados: z.number().int(),
  diferenciasDeArqueo: z.array(
    z.object({
      turnoId: z.string(),
      vendedor: z.object({ id: z.string(), nombre: z.string() }),
      caja: z.string(),
      moneda: z.string(),
      diferencia: z.string(),
      resultado: z.enum(['sobrante', 'faltante']),
      explicacion: z.string().nullable(),
    }),
  ),
});

export type ResumenJornada = z.infer<typeof esquemaResumen>;

const esquemaPorArquear = z.object({
  cuenta: cuentaResumen,
  /** Lo que debería haber; `null` la primera vez que se arquea esta cuenta. */
  esperado: z.string().nullable(),
});

const esquemaSaldoCuenta = z.object({
  cuenta: cuentaResumen,
  esperado: z.string().nullable(),
  reportado: z.string(),
  diferencia: z.string().nullable(),
  explicacion: z.string().nullable(),
  resultado: z.enum(['cuadrado', 'sobrante', 'faltante']).nullable(),
});

export const esquemaJornadaPublica = z.object({
  id: z.string(),
  fecha: z.string(),
  estado: z.enum(['abierta', 'cerrada']),
  sucursal: z.object({ id: z.string(), nombre: z.string() }),
  cerradaEn: z.date().nullable(),
  cerradaPor: z.object({ id: z.string(), nombre: z.string() }).nullable(),
  ciclo: z.number().int(),
  turnosAbiertos: z.number().int(),
});

export const respuestaListaJornadas = z.object({ jornadas: z.array(esquemaJornadaPublica) });

export const esquemaDetalleJornada = z.object({
  jornada: esquemaJornadaPublica,
  /** Lo que impide cerrar hoy. Vacío: se puede cerrar. */
  pendientes: z.object({
    turnosAbiertos: z.array(
      z.object({
        id: z.string(),
        caja: z.string(),
        vendedor: z.object({ id: z.string(), nombre: z.string() }),
      }),
    ),
    remesasTomadas: z.number().int(),
  }),
  /** Cuentas que el administrador debe arquear para cerrar (si está abierta). */
  cuentasPorArquear: z.array(esquemaPorArquear),
  /** Lo que se reportó en el último cierre (si está cerrada). */
  saldosReportados: z.array(esquemaSaldoCuenta),
  /** En vivo mientras está abierta; la foto del cierre cuando está cerrada. */
  resumen: esquemaResumen,
  eventos: z.array(
    z.object({
      tipo: z.enum(['cierre', 'reapertura']),
      usuario: z.object({ id: z.string(), nombre: z.string() }),
      motivo: z.string().nullable(),
      creadoEn: z.date(),
    }),
  ),
});

export type DetalleJornada = z.infer<typeof esquemaDetalleJornada>;

export const respuestaDetalleJornada = z.object({ detalle: esquemaDetalleJornada });
