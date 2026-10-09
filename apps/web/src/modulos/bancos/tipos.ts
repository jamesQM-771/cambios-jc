export interface Banco {
  id: string;
  codigo: string;
  nombre: string;
  pais: string;
  activo: boolean;
  creadoEn: string;
}

export interface DatosBancoNuevo {
  codigo: string;
  nombre: string;
  pais?: string;
}

export interface CambiosBanco {
  codigo?: string;
  nombre?: string;
  pais?: string;
}
