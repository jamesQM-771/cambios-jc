import type { Moneda } from '@cambios-jc/shared';

export type TipoCuenta = 'caja' | 'banco' | 'billetera';

export interface CuentaDinero {
  id: string;
  nombre: string;
  tipo: TipoCuenta;
  moneda: string;
  bancoId: string | null;
  bancoNombre: string | null;
  ultimos4Digitos: string | null;
  sucursalId: string;
  sucursalNombre: string;
  titular: string | null;
  responsableId: string | null;
  responsableNombre: string | null;
  activa: boolean;
  /** Como texto, con los decimales de su moneda: "5000000.00". Null = sin límite/comisión. */
  limiteDiario: string | null;
  comisionPorDefecto: string | null;
}

export type DatosCuentaNueva =
  | {
      tipo: 'banco';
      bancoId: string;
      ultimos4Digitos: string;
      nombre: string;
      moneda: Moneda;
      sucursalId: string;
      titular?: string | null;
      responsableId?: string | null;
      limiteDiario?: string | null;
      comisionPorDefecto?: string | null;
    }
  | {
      tipo: 'caja' | 'billetera';
      nombre: string;
      moneda: Moneda;
      sucursalId: string;
      titular?: string | null;
      responsableId?: string | null;
      limiteDiario?: string | null;
      comisionPorDefecto?: string | null;
    };

export interface CambiosCuenta {
  nombre?: string;
  ultimos4Digitos?: string;
  titular?: string | null;
  responsableId?: string | null;
  limiteDiario?: string | null;
  comisionPorDefecto?: string | null;
}
