import { Decimal, type ValorDecimal } from '../dinero/decimal.js';
import { ErrorDinero } from '../dinero/errores.js';
import { fijarMonto } from '../dinero/fijar.js';
import { DECIMALES_TASA, type Moneda } from '../dinero/monedas.js';
import { multiplicar, restar, sumar } from '../dinero/operaciones.js';
import { aDecimal } from '../dinero/serializacion.js';

/**
 * Inventario de una divisa con costo promedio ponderado móvil (PROYECTO.md §7.3, D138).
 *
 * - `cantidad`: unidades de la divisa compradas y aún no vendidas (puede quedar negativa si se paga
 *   más de lo que se registró como comprado; el costo se conserva hasta la siguiente compra).
 * - `costoPromedio`: pesos por unidad, con 6 decimales como toda tasa. `null` mientras no haya ni
 *   compras ni inventario inicial: sin costo conocido no se calcula ganancia.
 */
export interface EstadoInventario {
  cantidad: Decimal;
  costoPromedio: Decimal | null;
}

/** El costo promedio se guarda como una tasa: 6 decimales, ROUND_HALF_UP. */
export function fijarCosto(valor: ValorDecimal): Decimal {
  return aDecimal(valor).toDecimalPlaces(DECIMALES_TASA, Decimal.ROUND_HALF_UP);
}

function exigirPositivo(valor: Decimal, que: string): void {
  if (valor.lte(0)) throw new ErrorDinero('VALOR_INVALIDO', `${que} debe ser mayor que cero.`);
}

/**
 * Compra (o inventario inicial): `costo = (inventario × costo + cantidad × tasa) / (inventario + cantidad)`.
 * Si el inventario estaba en cero o negativo, el costo pasa a ser la tasa de esta compra: promediar
 * contra una cantidad negativa daría un costo sin sentido.
 */
export function entrarAlInventario(
  estado: EstadoInventario,
  cantidad: ValorDecimal,
  tasa: ValorDecimal,
  moneda: Moneda,
): EstadoInventario {
  const q = fijarMonto(cantidad, moneda);
  const t = aDecimal(tasa);
  exigirPositivo(q, 'La cantidad');
  exigirPositivo(t, 'La tasa');
  const nuevaCantidad = sumar(estado.cantidad, q);
  if (estado.cantidad.lte(0) || estado.costoPromedio === null) {
    return { cantidad: nuevaCantidad, costoPromedio: fijarCosto(t) };
  }
  const valor = sumar(multiplicar(estado.cantidad, estado.costoPromedio), multiplicar(q, t));
  return { cantidad: nuevaCantidad, costoPromedio: fijarCosto(valor.dividedBy(nuevaCantidad)) };
}

/** Venta o pago: sale al costo promedio vigente, que no cambia. Devuelve ese costo unitario. */
export function salirDelInventario(
  estado: EstadoInventario,
  cantidad: ValorDecimal,
  moneda: Moneda,
): { estado: EstadoInventario; costoUnitario: Decimal | null } {
  const q = fijarMonto(cantidad, moneda);
  exigirPositivo(q, 'La cantidad');
  return {
    estado: { cantidad: restar(estado.cantidad, q), costoPromedio: estado.costoPromedio },
    costoUnitario: estado.costoPromedio,
  };
}

/**
 * Deshace una compra anulada: saca esa cantidad a la tasa con que entró, para que el costo vuelva a
 * ser el que habría sido sin ella. Si no queda inventario positivo, o el resultado no tiene sentido
 * (costo cero o negativo porque ya se vendió lo comprado), la cantidad baja y el costo se conserva.
 * Las remesas pagadas entre la compra y su anulación conservan el costo con que se pagaron (D139).
 */
export function revertirEntrada(
  estado: EstadoInventario,
  cantidad: ValorDecimal,
  tasa: ValorDecimal,
  moneda: Moneda,
): EstadoInventario {
  const q = fijarMonto(cantidad, moneda);
  const t = aDecimal(tasa);
  exigirPositivo(q, 'La cantidad');
  exigirPositivo(t, 'La tasa');
  const restante = restar(estado.cantidad, q);
  if (restante.lte(0) || estado.costoPromedio === null || estado.cantidad.lte(0)) {
    return { cantidad: restante, costoPromedio: estado.costoPromedio };
  }
  const valor = restar(multiplicar(estado.cantidad, estado.costoPromedio), multiplicar(q, t));
  const costo = fijarCosto(valor.dividedBy(restante));
  return { cantidad: restante, costoPromedio: costo.gt(0) ? costo : estado.costoPromedio };
}

export interface GananciaRemesa {
  /** (tasa usada − costo promedio) × bolívares enviados, en pesos. */
  bruta: Decimal;
  /** Costo bancario del pago (en bolívares) llevado a pesos al costo promedio. */
  costoBancarioPesos: Decimal;
  /** bruta − costo bancario en pesos (§7.3). */
  neta: Decimal;
}

/**
 * Ganancia de una remesa COP → VES al pagarse (§7.3, D140). Cada parte se fija en pesos con
 * ROUND_HALF_UP y la neta es la resta de las dos partes ya fijadas, así siempre cuadran en pantalla.
 */
export function gananciaDeRemesa(datos: {
  montoBolivares: ValorDecimal;
  tasaUsada: ValorDecimal;
  costoPromedio: ValorDecimal;
  /** En bolívares; cero o `null` si el pago no tuvo costo. */
  costoBancario: ValorDecimal | null;
}): GananciaRemesa {
  const costo = aDecimal(datos.costoPromedio);
  const bruta = fijarMonto(
    multiplicar(restar(datos.tasaUsada, costo), datos.montoBolivares),
    'COP',
  );
  const costoBancarioPesos =
    datos.costoBancario === null
      ? new Decimal(0)
      : fijarMonto(multiplicar(datos.costoBancario, costo), 'COP');
  return { bruta, costoBancarioPesos, neta: fijarMonto(restar(bruta, costoBancarioPesos), 'COP') };
}
