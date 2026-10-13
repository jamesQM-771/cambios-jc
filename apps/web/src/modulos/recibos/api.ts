import { api } from '../../lib/api.js';

import type { Recibo } from './tipos.js';

/**
 * Emite el recibo de una remesa. Cada llamada queda registrada en el servidor: la primera es el
 * original y las siguientes salen como COPIA, así que no se llama para "ver" sino para imprimir.
 */
export const emitirRecibo = (remesaId: string) =>
  api.post<{ recibo: Recibo }>(`/remesas/${remesaId}/recibo`);
