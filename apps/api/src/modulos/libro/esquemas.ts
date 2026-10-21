import { esFechaValida } from '@cambios-jc/shared';
import { z } from 'zod';

const dia = z.string().refine(esFechaValida, 'Usa el formato AAAA-MM-DD con una fecha que exista.');

export const esquemaListarMovimientos = z.object({
  cuentaId: z.uuid().optional(),
  /** Día en la zona horaria de la empresa, incluido. */
  desde: dia.optional(),
  /** Día en la zona horaria de la empresa, incluido. */
  hasta: dia.optional(),
});

export const esquemaMovimiento = z.object({
  id: z.string(),
  cuenta: z.object({ id: z.string(), nombre: z.string(), moneda: z.string() }),
  sentido: z.enum(['entrada', 'salida']),
  /** Siempre positivo; el sentido dice si entra o sale. */
  monto: z.string(),
  origen: z.enum(['remesa_ingreso', 'remesa_pago', 'remesa_costo', 'remesa_anulacion']),
  operacion: z.object({ id: z.string(), numeroComprobante: z.number().int() }).nullable(),
  /** Si este movimiento deshace otro, cuál. */
  revierteId: z.string().nullable(),
  usuario: z.object({ id: z.string(), nombre: z.string() }),
  creadoEn: z.date(),
});

export type MovimientoPublico = z.infer<typeof esquemaMovimiento>;

export const respuestaMovimientos = z.object({ movimientos: z.array(esquemaMovimiento) });

export const esquemaSaldoCuenta = z.object({
  cuenta: z.object({
    id: z.string(),
    nombre: z.string(),
    tipo: z.enum(['caja', 'banco', 'billetera']),
    moneda: z.string(),
    caja: z.object({ id: z.string(), nombre: z.string() }).nullable(),
  }),
  /** Entradas − salidas según el libro. Negativo es una cuenta que pagó más de lo que recibió. */
  saldo: z.string(),
});

export const respuestaSaldos = z.object({ saldos: z.array(esquemaSaldoCuenta) });
