export interface Sucursal {
  id: string;
  nombre: string;
  ciudad: string;
  activa: boolean;
}

export interface DatosSucursalNueva {
  nombre: string;
  ciudad: string;
}

export interface CambiosSucursal {
  nombre?: string;
  ciudad?: string;
}
