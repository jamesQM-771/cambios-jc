import { formatearMoneda, type Moneda } from '@cambios-jc/shared';

import { cantidadDe, limpiarCantidad, subtotalDe, totalDe } from '../../lib/conteo.js';
import type { ConteoEnviado, MonedaDeCaja } from '../../modulos/turnos/tipos.js';

/** Lo escrito en cada campo, por id de denominación. */
export type Cantidades = Record<string, string>;

interface Propiedades {
  moneda: MonedaDeCaja;
  cantidades: Cantidades;
  alCambiar: (denominacionId: string, texto: string) => void;
}

/**
 * Conteo del efectivo de una moneda, billete por billete (§5.16). Muestra el subtotal y el total
 * mientras se cuenta; el servidor los recalcula y es quien manda.
 */
export function ConteoPorDenominacion({ moneda, cantidades, alCambiar }: Propiedades) {
  const codigo = moneda.moneda as Moneda;
  const lineas = moneda.denominaciones.map((denominacion) => ({
    ...denominacion,
    cantidad: cantidadDe(cantidades[denominacion.id]),
  }));

  return (
    <section className="conteo" aria-label={`Efectivo en ${moneda.moneda}`}>
      <h3 className="conteo__titulo">Efectivo en {moneda.moneda}</h3>
      {lineas.length === 0 ? (
        <p className="campo__ayuda">
          No hay denominaciones activas en {moneda.moneda}: pídele al administrador que las
          configure.
        </p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">Conteo del efectivo en {moneda.moneda}</caption>
            <thead>
              <tr>
                <th scope="col">Denominación</th>
                <th scope="col" className="tabla__numero">
                  Cantidad
                </th>
                <th scope="col" className="tabla__numero">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((linea) => (
                <tr key={linea.id}>
                  <th scope="row" className="mono">
                    {formatearMoneda(linea.valor, codigo)}
                  </th>
                  <td className="tabla__numero">
                    <input
                      className="campo__entrada conteo__cantidad"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="0"
                      aria-label={`Cantidad de ${formatearMoneda(linea.valor, codigo)}`}
                      value={cantidades[linea.id] ?? ''}
                      onChange={(evento) =>
                        alCambiar(linea.id, limpiarCantidad(evento.target.value))
                      }
                    />
                  </td>
                  <td className="tabla__numero mono">
                    {formatearMoneda(subtotalDe(linea.valor, linea.cantidad, codigo), codigo)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={2}>
                  Total contado
                </th>
                <td className="tabla__numero mono conteo__total">
                  {formatearMoneda(totalDe(lineas, codigo), codigo)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

/** Lo que se envía al servidor: solo las denominaciones con algo contado. */
export function conteosParaEnviar(
  monedas: readonly MonedaDeCaja[],
  cantidades: Cantidades,
): ConteoEnviado[] {
  return monedas.map((moneda) => ({
    moneda: moneda.moneda,
    lineas: moneda.denominaciones
      .map((denominacion) => ({
        denominacionId: denominacion.id,
        cantidad: cantidadDe(cantidades[denominacion.id]),
      }))
      .filter((linea) => linea.cantidad > 0),
  }));
}
