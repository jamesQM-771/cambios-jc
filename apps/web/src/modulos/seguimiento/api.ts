import { api } from '../../lib/api.js';

import type { Seguimiento } from './tipos.js';

export const consultarSeguimiento = (codigo: string) =>
  api.get<{ seguimiento: Seguimiento }>(`/seguimiento/${encodeURIComponent(codigo)}`);
