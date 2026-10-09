export interface Caja {
  id: string;
  nombre: string;
  sucursalId: string;
  sucursalNombre: string;
  activa: boolean;
}

export interface DatosCajaNueva {
  nombre: string;
  sucursalId: string;
}

export interface CambiosCaja {
  nombre?: string;
}
