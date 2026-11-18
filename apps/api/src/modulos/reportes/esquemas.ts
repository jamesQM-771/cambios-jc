import { esFechaValida } from '@cambios-jc/shared';
import { z } from 'zod';

const dia = z.string().refine(esFechaValida, 'Usa el formato AAAA-MM-DD con una fecha que exista.');

export const esquemaPeriodo = z
  .object({
    desde: dia,
    hasta: dia,
    /** `csv` devuelve el mismo reporte como archivo para abrir en Excel. */
    formato: z.enum(['json', 'csv']).default('json'),
  })
  .refine((d) => d.desde <= d.hasta, {
    message: 'La fecha inicial va antes de la final.',
    path: ['hasta'],
  });

export const REPORTES = [
  'ganancia',
  'top_clientes',
  'proveedores',
  'arqueo',
  'tasas_manuales',
  'costos_bancarios',
] as const;
export type NombreReporte = (typeof REPORTES)[number];

export const esquemaNombreReporte = z.object({ nombre: z.enum(REPORTES) });

/** Un reporte es una tabla: títulos de columna y filas de texto (los montos ya formateados para la API). */
export const esquemaTablaReporte = z.object({
  titulo: z.string(),
  columnas: z.array(z.string()),
  filas: z.array(z.array(z.string())),
});

export type TablaReporte = z.infer<typeof esquemaTablaReporte>;

export const respuestaReporte = z.object({ reporte: esquemaTablaReporte });

export const esquemaBusqueda = z.object({
  tipo: z.enum(['remesa', 'divisa']).optional(),
  comprobante: z.coerce.number().int().positive().optional(),
  /** Documento o nombre del cliente (remitente, beneficiario o cliente de divisas). */
  texto: z.string().trim().min(2).max(80).optional(),
  usuarioId: z.uuid().optional(),
  estado: z.string().trim().max(30).optional(),
  /** Fecha: `igual`, `mayor` (desde, incluida), `menor` (hasta, incluida) o `entre`. */
  comparacion: z.enum(['igual', 'mayor', 'menor', 'entre']).optional(),
  fecha: dia.optional(),
  fechaHasta: dia.optional(),
  pagina: z.coerce.number().int().positive().default(1),
});

export const respuestaBusqueda = z.object({
  resultados: z.array(
    z.object({
      tipo: z.enum(['remesa', 'divisa']),
      id: z.string(),
      numeroComprobante: z.number().int(),
      fecha: z.date(),
      estado: z.string(),
      cliente: z.string(),
      beneficiario: z.string().nullable(),
      usuario: z.string(),
      montoLocal: z.string(),
      montoExtranjero: z.string(),
      monedaExtranjera: z.string(),
      tasa: z.string(),
    }),
  ),
  pagina: z.number().int(),
  hayMas: z.boolean(),
});

export const respuestaTablero = z.object({
  tablero: z.object({
    moneda: z.string(),
    gananciaHoy: z.string(),
    gananciaMes: z.string(),
    remesasHoy: z.number().int(),
    liquidez: z.array(
      z.object({
        moneda: z.string(),
        disponible: z.string(),
        comprometido: z.string(),
        libre: z.string(),
      }),
    ),
    contrapartes: z.array(
      z.object({ moneda: z.string(), meDeben: z.string(), lesDebo: z.string() }),
    ),
    alertasAbiertas: z.number().int(),
  }),
});
