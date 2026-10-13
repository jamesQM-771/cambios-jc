import { z } from 'zod';

export const esquemaId = z.object({ id: z.uuid() });

const esquemaPersona = z.object({
  nombre: z.string(),
  tipoDocumento: z.string(),
  numeroDocumento: z.string(),
});

/**
 * Todo lo que lleva el recibo (§5.3 de PROYECTO.md), ya armado por el servidor: la pantalla solo lo
 * dibuja. El formato de los montos y la fecha salen de aquí para que el ticket, la versión digital y
 * el texto para WhatsApp digan exactamente lo mismo.
 */
export const esquemaRecibo = z.object({
  /** `false` en la primera impresión; `true` en las siguientes, que salen marcadas COPIA. */
  esCopia: z.boolean(),
  /** 0 en el original; 1, 2… en cada reimpresión. */
  numeroCopia: z.number().int(),
  numeroComprobante: z.number().int(),
  /** Código y enlace con los que el cliente consulta su envío sin iniciar sesión. */
  codigoSeguimiento: z.string(),
  urlSeguimiento: z.string(),
  fecha: z.date(),
  fechaTexto: z.string(),
  empresa: z.object({
    nombre: z.string(),
    nit: z.string().nullable(),
    telefono: z.string().nullable(),
    whatsapp: z.string().nullable(),
    direccion: z.string().nullable(),
    tieneLogo: z.boolean(),
    textoPie: z.string().nullable(),
    zonaHoraria: z.string(),
  }),
  remitente: esquemaPersona,
  beneficiario: z.object({
    titular: z.string(),
    tipoDocumento: z.string(),
    numeroDocumento: z.string(),
    tipoPago: z.enum(['cuenta_bancaria', 'pago_movil']),
    banco: z.object({ codigo: z.string(), nombre: z.string() }),
    numeroCuenta: z.string().nullable(),
    telefonoPagoMovil: z.string().nullable(),
  }),
  /** Pesos que entregó el cliente, ya con formato: "COP 162.000". */
  montoPesosTexto: z.string(),
  /** Bolívares que recibe el beneficiario: "VES 43.085,106". */
  montoBolivaresTexto: z.string(),
  vendedor: z.string(),
  /** El mismo recibo en texto plano, para compartirlo (WhatsApp, mensaje). */
  texto: z.string(),
});

export type Recibo = z.infer<typeof esquemaRecibo>;

export const respuestaRecibo = z.object({ recibo: esquemaRecibo });
