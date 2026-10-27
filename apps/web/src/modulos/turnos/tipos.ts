export type MomentoConteo = 'apertura' | 'cierre';
export type ResultadoArqueo = 'cuadrado' | 'sobrante' | 'faltante';

/** Total contado de una moneda al abrir o cerrar, contra lo esperado (§5.16). */
export interface SaldoTurno {
  momento: MomentoConteo;
  moneda: string;
  esperado: string | null;
  contado: string;
  diferencia: string | null;
  explicacion: string | null;
  resultado: ResultadoArqueo | null;
}

export interface ConteoTurno {
  momento: MomentoConteo;
  moneda: string;
  valor: string;
  cantidad: number;
}

export interface Turno {
  id: string;
  caja: { id: string; nombre: string };
  usuario: { id: string; nombre: string };
  estado: 'abierto' | 'cerrado';
  abiertoEn: string;
  cerradoEn: string | null;
  cerradoPor: { id: string; nombre: string } | null;
  motivoCierre: string | null;
  jornada: { id: string; fecha: string };
  saldos: SaldoTurno[];
  conteos: ConteoTurno[];
}

export interface MonedaDeCaja {
  moneda: string;
  cuenta: { id: string; nombre: string };
  denominaciones: { id: string; valor: string }[];
}

export interface CajaParaTurno {
  id: string;
  nombre: string;
  sucursal: { id: string; nombre: string };
  /** Nombre de quien tiene el turno abierto en esa caja, o `null` si está libre. */
  ocupadaPor: string | null;
  monedas: MonedaDeCaja[];
}

export interface OpcionesTurno {
  cajas: CajaParaTurno[];
  miTurno: Turno | null;
}

/** Cuántos billetes o monedas de una denominación se contaron. */
export interface LineaConteoEnviada {
  denominacionId: string;
  cantidad: number;
}

export interface ConteoEnviado {
  moneda: string;
  lineas: LineaConteoEnviada[];
}

export interface DatosAbrirTurno {
  cajaId: string;
  conteos: ConteoEnviado[];
}

export interface DatosCerrarTurno {
  conteos: ConteoEnviado[];
  explicaciones: { moneda: string; texto: string }[];
  /** Obligatorio cuando el administrador cierra el turno de otra persona. */
  motivo?: string;
}

export const ETIQUETAS_RESULTADO: Record<ResultadoArqueo, string> = {
  cuadrado: 'Cuadrado',
  sobrante: 'Sobrante',
  faltante: 'Faltante',
};

export const TONO_RESULTADO: Record<ResultadoArqueo, 'exito' | 'alerta' | 'error'> = {
  cuadrado: 'exito',
  sobrante: 'alerta',
  faltante: 'error',
};
