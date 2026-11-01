import { api, urlApi } from '../../lib/api.js';

export type NombreReporte =
  'ganancia' | 'top_clientes' | 'proveedores' | 'arqueo' | 'tasas_manuales' | 'costos_bancarios';

export interface TablaReporte {
  titulo: string;
  columnas: string[];
  filas: string[][];
}

export interface Tablero {
  moneda: string;
  gananciaHoy: string;
  gananciaMes: string;
  remesasHoy: number;
  liquidez: { moneda: string; disponible: string; comprometido: string; libre: string }[];
  contrapartes: { moneda: string; meDeben: string; lesDebo: string }[];
  alertasAbiertas: number;
}

export interface ResultadoBusqueda {
  tipo: 'remesa' | 'divisa';
  id: string;
  numeroComprobante: number;
  fecha: string;
  estado: string;
  cliente: string;
  beneficiario: string | null;
  usuario: string;
  montoLocal: string;
  montoExtranjero: string;
  monedaExtranjera: string;
  tasa: string;
}

export interface FiltroBusqueda {
  tipo?: 'remesa' | 'divisa' | undefined;
  comprobante?: string | undefined;
  texto?: string | undefined;
  estado?: string | undefined;
  comparacion?: 'igual' | 'mayor' | 'menor' | 'entre' | undefined;
  fecha?: string | undefined;
  fechaHasta?: string | undefined;
  pagina: number;
}

export interface FilaMigracion {
  linea: number;
  nombre: string;
  moneda: string;
  saldoExcel: string;
  saldoSistema: string;
  contraparteExiste: boolean;
  etiqueta: 'me_debe' | 'le_debo';
}

export interface ResultadoMigracion {
  filas: FilaMigracion[];
  errores: { linea: number; mensaje: string }[];
  aplicadas: number;
  yaCargadas: number;
}

export const obtenerTablero = () => api.get<{ tablero: Tablero }>('/reportes/tablero');
export const obtenerReporte = (nombre: NombreReporte, desde: string, hasta: string) =>
  api.get<{ reporte: TablaReporte }>(`/reportes/${nombre}`, { desde, hasta });
export const urlReporteCsv = (nombre: NombreReporte, desde: string, hasta: string) =>
  urlApi(`/reportes/${nombre}?desde=${desde}&hasta=${hasta}&formato=csv`);
export const buscarOperaciones = (filtro: FiltroBusqueda) =>
  api.get<{ resultados: ResultadoBusqueda[]; pagina: number; hayMas: boolean }>(
    '/reportes/buscar',
    { ...filtro },
  );
export const URL_EXPORTACION = urlApi('/datos/exportacion');
export const migrarSaldos = (csv: string, aplicar: boolean) =>
  api.post<ResultadoMigracion>('/datos/migracion/saldos-contrapartes', { csv, aplicar });
