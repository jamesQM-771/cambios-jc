export type TipoAlerta =
  'lista_restrictiva' | 'fraccionamiento' | 'concentracion' | 'ficha_requerida';
export type EstadoAlerta = 'abierta' | 'descartada' | 'escalada';
export type NivelRiesgo = 'bajo' | 'medio' | 'alto';

export interface Alerta {
  id: string;
  tipo: TipoAlerta;
  estado: EstadoAlerta;
  cliente: { id: string; nombre: string; tipoDocumento: string; numeroDocumento: string };
  operacion: { id: string; numeroComprobante: number } | null;
  detalle: Record<string, unknown>;
  justificacion: string | null;
  resueltaPor: { id: string; nombre: string } | null;
  resueltaEn: string | null;
  creadoEn: string;
}

export interface EntradaLista {
  id: string;
  fuente: 'onu' | 'ofac' | 'propia';
  nombre: string;
  numeroDocumento: string | null;
  nota: string | null;
  activa: boolean;
  creadoEn: string;
}

export interface Parametros {
  umbralFichaMensual: string | null;
  fraccionamientoCantidad: number | null;
  fraccionamientoMontoMaximo: string | null;
  concentracionRemitentes: number | null;
}

interface PorPeriodo {
  dia: string;
  mes: string;
  anio: string;
}

export interface CumplimientoCliente {
  cliente: { id: string; nombre: string; tipoDocumento: string; numeroDocumento: string };
  perfil: {
    actividadEconomica: string | null;
    origenFondos: string | null;
    direccion: string | null;
    pep: boolean;
    nivel: NivelRiesgo;
    motivoNivel: string | null;
    actualizadoEn: string;
  } | null;
  acumulados: { comoRemitente: PorPeriodo; comoBeneficiario: PorPeriodo };
  alertas: Alerta[];
}

export const ETIQUETAS_ALERTA: Record<TipoAlerta, string> = {
  lista_restrictiva: 'Coincidencia en lista restrictiva',
  fraccionamiento: 'Posible fraccionamiento',
  concentracion: 'Beneficiario con muchos remitentes',
  ficha_requerida: 'Ficha ampliada requerida',
};

export const ETIQUETAS_ESTADO_ALERTA: Record<EstadoAlerta, string> = {
  abierta: 'Abierta',
  descartada: 'Descartada',
  escalada: 'Escalada',
};

export const ETIQUETAS_NIVEL: Record<NivelRiesgo, string> = {
  bajo: 'Bajo',
  medio: 'Medio',
  alto: 'Alto',
};

export const ETIQUETAS_FUENTE: Record<EntradaLista['fuente'], string> = {
  onu: 'ONU',
  ofac: 'OFAC',
  propia: 'Propia',
};
