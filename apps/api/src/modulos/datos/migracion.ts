import { aDecimal, comparar, montoATexto, type Moneda } from '@cambios-jc/shared';

/**
 * Lectura del CSV de saldos iniciales de contrapartes exportado del Excel (§11.2, pasos 3 y 4; D157).
 * Columnas: nombre, moneda, saldo. Acepta coma o punto y coma como separador y el número escrito como
 * en Colombia ("1.250.000,50") o con punto decimal ("1250000.50"). En el Excel, negativo = nos debe:
 * en el sistema es al revés (positivo = me debe), así que el signo se invierte.
 */
export interface FilaSaldo {
  linea: number;
  nombre: string;
  moneda: Moneda;
  /** Tal como venía en el Excel. */
  saldoExcel: string;
  /** Con el signo del sistema: positivo = me debe. */
  saldoSistema: string;
}

export interface ErrorFila {
  linea: number;
  mensaje: string;
}

const MONEDAS: readonly Moneda[] = ['COP', 'VES', 'USD'];

export function numeroDelExcel(texto: string): string | null {
  let limpio = texto.trim().replace(/\s/g, '').replace(/^\$/, '');
  if (limpio === '') return null;
  if (limpio.includes(',')) limpio = limpio.replace(/\./g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(limpio) ? limpio : null;
}

export function leerSaldos(csv: string): { filas: FilaSaldo[]; errores: ErrorFila[] } {
  const lineas = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
  const separador = (lineas[0] ?? '').includes(';') ? ';' : ',';
  const filas: FilaSaldo[] = [];
  const errores: ErrorFila[] = [];
  const vistos = new Set<string>();
  lineas.forEach((texto, indice) => {
    const linea = indice + 1;
    if (texto.trim() === '' || indice === 0) return; // encabezado y líneas vacías
    const [nombreBruto = '', monedaBruta = '', saldoBruto = ''] = texto
      .split(separador)
      .map((c) => c.trim().replace(/^"|"$/g, ''));
    const nombre = nombreBruto.replace(/\s+/g, ' ').trim();
    const moneda = monedaBruta.toUpperCase() as Moneda;
    const numero = numeroDelExcel(saldoBruto);
    if (nombre.length < 2) return errores.push({ linea, mensaje: 'Falta el nombre.' });
    if (!MONEDAS.includes(moneda)) {
      return errores.push({
        linea,
        mensaje: `Moneda "${monedaBruta}" no válida (COP, VES o USD).`,
      });
    }
    if (numero === null)
      return errores.push({ linea, mensaje: `Saldo "${saldoBruto}" no es un número.` });
    if (comparar(numero, '0') === 0) return; // saldo en cero: no hay nada que cargar
    const fijado = montoATexto(numero, moneda);
    if (comparar(fijado, numero) !== 0) {
      return errores.push({
        linea,
        mensaje: `Los montos en ${moneda} no admiten ese número de decimales.`,
      });
    }
    const clave = `${nombre.toLowerCase()}|${moneda}`;
    if (vistos.has(clave)) {
      return errores.push({
        linea,
        mensaje: `"${nombre}" en ${moneda} está repetido: unifícalo antes de cargar.`,
      });
    }
    vistos.add(clave);
    filas.push({
      linea,
      nombre,
      moneda,
      saldoExcel: fijado,
      saldoSistema: montoATexto(aDecimal(fijado).negated(), moneda),
    });
    return undefined;
  });
  return { filas, errores };
}
