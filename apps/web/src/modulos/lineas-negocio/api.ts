import { api } from '../../lib/api.js';

import type { CambiosLineaNegocio, DatosLineaNegocioNueva, LineaNegocio } from './tipos.js';

export const listarLineasNegocio = () =>
  api.get<{ lineasNegocio: LineaNegocio[] }>('/lineas-negocio');

export const crearLineaNegocio = (datos: DatosLineaNegocioNueva) =>
  api.post<{ lineaNegocio: LineaNegocio }>('/lineas-negocio', datos);

export const editarLineaNegocio = (id: string, cambios: CambiosLineaNegocio) =>
  api.patch<{ lineaNegocio: LineaNegocio }>(`/lineas-negocio/${id}`, cambios);

export const desactivarLineaNegocio = (id: string) =>
  api.post<{ lineaNegocio: LineaNegocio }>(`/lineas-negocio/${id}/desactivar`);

export const reactivarLineaNegocio = (id: string) =>
  api.post<{ lineaNegocio: LineaNegocio }>(`/lineas-negocio/${id}/reactivar`);
