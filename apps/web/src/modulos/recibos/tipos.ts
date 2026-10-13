/** Recibo de una remesa tal como lo arma el servidor (`POST /remesas/:id/recibo`). */
export interface Recibo {
  /** `false` en la primera impresión; `true` en las siguientes (salen marcadas COPIA). */
  esCopia: boolean;
  numeroCopia: number;
  numeroComprobante: number;
  /** Con este código (o el enlace) el cliente consulta su envío sin iniciar sesión. */
  codigoSeguimiento: string;
  urlSeguimiento: string;
  fecha: string;
  fechaTexto: string;
  empresa: {
    nombre: string;
    nit: string | null;
    telefono: string | null;
    whatsapp: string | null;
    direccion: string | null;
    tieneLogo: boolean;
    textoPie: string | null;
    zonaHoraria: string;
  };
  remitente: { nombre: string; tipoDocumento: string; numeroDocumento: string };
  beneficiario: {
    titular: string;
    tipoDocumento: string;
    numeroDocumento: string;
    tipoPago: 'cuenta_bancaria' | 'pago_movil';
    banco: { codigo: string; nombre: string };
    numeroCuenta: string | null;
    telefonoPagoMovil: string | null;
  };
  montoPesosTexto: string;
  montoBolivaresTexto: string;
  vendedor: string;
  /** El mismo recibo en texto plano, para compartirlo. */
  texto: string;
}

/** Ancho del papel de la impresora térmica, en milímetros. */
export type AnchoRecibo = 58 | 80;
