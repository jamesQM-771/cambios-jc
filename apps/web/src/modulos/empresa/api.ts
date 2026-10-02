import { api } from '../../lib/api.js';
import type { EmpresaSesion } from '../auth/tipos.js';

export type Empresa = EmpresaSesion & { actualizadaEn: string };

/** Campos que se pueden cambiar desde la pantalla de la empresa. */
export interface CambiosEmpresa {
  nombre?: string;
  nit?: string;
  telefono?: string;
  whatsapp?: string;
  direccion?: string;
  monedaLocal?: string;
  zonaHoraria?: string;
  textoPieRecibo?: string;
}

export const CLAVE_EMPRESA = ['empresa'] as const;

export const pedirEmpresa = async () => (await api.get<{ empresa: Empresa }>('/empresa')).empresa;

export const editarEmpresa = async (cambios: CambiosEmpresa) =>
  (await api.patch<{ empresa: Empresa }>('/empresa', cambios)).empresa;

export const subirLogo = async (archivo: File) => {
  const formulario = new FormData();
  formulario.set('logo', archivo);
  return (await api.subir<{ empresa: Empresa }>('/empresa/logo', formulario)).empresa;
};
