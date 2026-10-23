import { formatearMoneda, type Moneda } from '@cambios-jc/shared';

import {
  ETIQUETAS_RESULTADO,
  TONO_RESULTADO,
  type MomentoConteo,
  type SaldoTurno,
} from '../../modulos/turnos/tipos.js';

/** Lo esperado, lo contado y la diferencia de un turno, moneda por moneda. */
export function TablaArqueo({
  saldos,
  momento,
}: {
  saldos: readonly SaldoTurno[];
  momento: MomentoConteo;
}) {
  const filas = saldos.filter((saldo) => saldo.momento === momento);
  if (filas.length === 0) return null;
  const formato = (valor: string | null, moneda: string) =>
    valor === null ? '—' : formatearMoneda(valor, moneda as Moneda);

  return (
    <div className="tabla-contenedor">
      <table className="tabla">
        <caption className="solo-lectores">
          Arqueo {momento === 'apertura' ? 'de la apertura' : 'del cierre'}
        </caption>
        <thead>
          <tr>
            <th scope="col">Moneda</th>
            <th scope="col" className="tabla__numero">
              Esperado
            </th>
            <th scope="col" className="tabla__numero">
              Contado
            </th>
            <th scope="col" className="tabla__numero">
              Diferencia
            </th>
            <th scope="col">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((saldo) => {
            const resultado =
              saldo.resultado ??
              (saldo.diferencia === null
                ? null
                : /^-?0([.,]0+)?$/.test(saldo.diferencia)
                  ? 'cuadrado'
                  : saldo.diferencia.startsWith('-')
                    ? 'faltante'
                    : 'sobrante');
            return (
              <tr key={saldo.moneda}>
                <th scope="row">{saldo.moneda}</th>
                <td className="tabla__numero mono">{formato(saldo.esperado, saldo.moneda)}</td>
                <td className="tabla__numero mono">{formato(saldo.contado, saldo.moneda)}</td>
                <td className="tabla__numero mono">{formato(saldo.diferencia, saldo.moneda)}</td>
                <td>
                  {resultado ? (
                    <span className={`etiqueta etiqueta--${TONO_RESULTADO[resultado]}`}>
                      {ETIQUETAS_RESULTADO[resultado]}
                    </span>
                  ) : (
                    <small>Primer conteo de la caja</small>
                  )}
                  {saldo.explicacion && <small>{saldo.explicacion}</small>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
