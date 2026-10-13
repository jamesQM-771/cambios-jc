/**
 * Contrato del tiempo real entre la API y la web (fase 2, tarea 2.6).
 *
 * Los eventos son avisos mínimos: dicen que algo cambió y la pantalla vuelve a pedir los datos por
 * la API normal, donde se aplican los permisos. Así un evento nunca lleva información que la
 * persona no podría ver (el digitador no recibe pesos, tasa ni datos del remitente).
 */
export const EVENTOS_TIEMPO_REAL = {
  /** Para quien paga: la cola cambió (entró, salió o cambió una transferencia). Sin datos. */
  colaCambio: 'cola:cambio',
  /** Para quien vende: una remesa cambió de estado. */
  remesaCambio: 'remesa:cambio',
} as const;

export interface CambioRemesa {
  id: string;
  estado: string;
}

/** Ruta del servidor de tiempo real, detrás del mismo prefijo `/api` que el resto de la API. */
export const RUTA_TIEMPO_REAL = '/api/socket.io';
