/** Lo que ve quien consulta con su código (`GET /seguimiento/:codigo`), sin iniciar sesión. */
export type EstadoSeguimiento =
  'recibida' | 'en_proceso' | 'enviada' | 'en_revision' | 'anulada' | 'devuelta';

export interface Seguimiento {
  numeroComprobante: number;
  estado: EstadoSeguimiento;
  mensaje: string;
  montoBolivaresTexto: string;
  fecha: string;
  actualizadaEn: string;
  empresa: { nombre: string; zonaHoraria: string };
}
