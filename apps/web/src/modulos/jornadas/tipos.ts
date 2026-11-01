export type EstadoJornada = 'abierta' | 'cerrada';

export interface CuentaDeJornada {
  id: string;
  nombre: string;
  tipo: 'caja' | 'banco' | 'billetera';
  moneda: string;
}

export interface Jornada {
  id: string;
  fecha: string;
  estado: EstadoJornada;
  sucursal: { id: string; nombre: string };
  cerradaEn: string | null;
  cerradaPor: { id: string; nombre: string } | null;
  ciclo: number;
  turnosAbiertos: number;
}

export interface TotalPorMoneda {
  moneda: string;
  total: string;
}

export type OrigenSaldo = 'conteo_de_turno' | 'reportado' | 'esperado' | 'sin_dato';

export interface ResumenJornada {
  fecha: string;
  sucursal: { id: string; nombre: string };
  disponible: {
    cuenta: CuentaDeJornada;
    caja: { id: string; nombre: string } | null;
    saldo: string | null;
    origen: OrigenSaldo;
  }[];
  totalDisponible: TotalPorMoneda[];
  remesas: {
    registradas: number;
    completadas: number;
    anuladas: number;
    devueltas: number;
    pendientes: number;
  };
  pesosRecibidos: TotalPorMoneda[];
  devoluciones: TotalPorMoneda[];
  costosBancarios: TotalPorMoneda[];
  gastosOperativos: TotalPorMoneda[];
  retirosDelDueno: TotalPorMoneda[];
  traslados: number;
  diferenciasDeArqueo: {
    turnoId: string;
    vendedor: { id: string; nombre: string };
    caja: string;
    moneda: string;
    diferencia: string;
    resultado: 'sobrante' | 'faltante';
    explicacion: string | null;
  }[];
  /** Desde la fase 4 (D141); las jornadas cerradas antes no lo traen. */
  ganancia?: {
    moneda: string;
    remesasCosteadas: number;
    remesasSinCosto: number;
    gananciaRemesas: string;
    costosBancarios: string;
    gastosOperativos: string;
    gananciaDelDia: string;
  };
  contrapartes?: {
    saldos: { moneda: string; meDeben: string; lesDebo: string }[];
    movimientosDelDia: number;
  };
  devolucionesPendientes?: TotalPorMoneda[];
  posicion?: TotalPorMoneda[];
}

export interface SaldoCuentaJornada {
  cuenta: CuentaDeJornada;
  esperado: string | null;
  reportado: string;
  diferencia: string | null;
  explicacion: string | null;
  resultado: 'cuadrado' | 'sobrante' | 'faltante' | null;
}

export interface DetalleJornada {
  jornada: Jornada;
  pendientes: {
    turnosAbiertos: { id: string; caja: string; vendedor: { id: string; nombre: string } }[];
    remesasTomadas: number;
  };
  cuentasPorArquear: { cuenta: CuentaDeJornada; esperado: string | null }[];
  saldosReportados: SaldoCuentaJornada[];
  resumen: ResumenJornada;
  eventos: {
    tipo: 'cierre' | 'reapertura';
    usuario: { id: string; nombre: string };
    motivo: string | null;
    creadoEn: string;
  }[];
}

export interface DatosCerrarJornada {
  saldos: { cuentaId: string; reportado: string; explicacion?: string }[];
}
