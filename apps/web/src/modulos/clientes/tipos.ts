/** Tipos de documento que acepta el sistema (D97): lista fija de Venezuela y Colombia. */
export const TIPOS_DOCUMENTO = ['V', 'E', 'J', 'G', 'P', 'CC', 'CE', 'PPT', 'PAS', 'NIT'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export interface Cliente {
  id: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  nombre: string;
  telefono: string | null;
  activo: boolean;
  creadoEn: string;
}

export type TipoMedioPago = 'cuenta_bancaria' | 'pago_movil';

export interface MedioPago {
  id: string;
  tipo: TipoMedioPago;
  banco: { id: string; codigo: string; nombre: string };
  numeroCuenta: string | null;
  telefonoPagoMovil: string | null;
  titular: string;
  tipoDocumentoTitular: TipoDocumento;
  numeroDocumentoTitular: string;
  activo: boolean;
  creadoEn: string;
}

export interface ClienteConMedios extends Cliente {
  mediosPago: MedioPago[];
}

export interface DatosClienteNuevo {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  nombre: string;
  telefono?: string;
}

export interface CambiosCliente {
  nombre?: string;
  telefono?: string | null;
}

interface DatosTitular {
  bancoId: string;
  titular: string;
  tipoDocumentoTitular: TipoDocumento;
  numeroDocumentoTitular: string;
}

export type DatosMedioPagoNuevo =
  | ({ tipo: 'cuenta_bancaria'; numeroCuenta: string } & DatosTitular)
  | ({ tipo: 'pago_movil'; telefonoPagoMovil: string } & DatosTitular);

/** "0102 0000 0000 0000 0001" (20 dígitos en grupos de 4), como se lee y se copia. */
export function formatearCuenta(numero: string): string {
  return numero.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function resumenMedioPago(medio: MedioPago): string {
  const destino =
    medio.tipo === 'cuenta_bancaria'
      ? formatearCuenta(medio.numeroCuenta ?? '')
      : (medio.telefonoPagoMovil ?? '');
  return `${medio.banco.nombre} · ${medio.tipo === 'cuenta_bancaria' ? 'Cuenta' : 'Pago móvil'} ${destino} · ${medio.titular}`;
}
