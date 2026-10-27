import { api } from '../../lib/api.js';

import type { CategoriaGasto } from './tipos.js';

export const listarCategoriasGasto = () =>
  api.get<{ categorias: CategoriaGasto[] }>('/categorias-gasto');

export const crearCategoriaGasto = (nombre: string) =>
  api.post<{ categoria: CategoriaGasto }>('/categorias-gasto', { nombre });

export const editarCategoriaGasto = (id: string, nombre: string) =>
  api.patch<{ categoria: CategoriaGasto }>(`/categorias-gasto/${id}`, { nombre });

export const desactivarCategoriaGasto = (id: string) =>
  api.post<{ categoria: CategoriaGasto }>(`/categorias-gasto/${id}/desactivar`);

export const reactivarCategoriaGasto = (id: string) =>
  api.post<{ categoria: CategoriaGasto }>(`/categorias-gasto/${id}/reactivar`);
