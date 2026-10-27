import { formatearMoneda, type Moneda } from '@cambios-jc/shared';

import type { OrigenSaldo, ResumenJornada, TotalPorMoneda } from '../../modulos/jornadas/tipos.js';

const ORIGEN: Record<OrigenSaldo, string> = {
  conteo_de_turno: 'Conteo de la caja',
  reportado: 'Reportado al cerrar',
  esperado: 'Lo que dice el libro',
  sin_dato: 'Sin dato todavía',
};

const dinero = (valor: string, moneda: string) => formatearMoneda(valor, moneda as Moneda);

function Totales({ titulo, filas }: { titulo: string; filas: readonly TotalPorMoneda[] }) {
  return (
    <div>
      <dt>{titulo}</dt>
      <dd className="mono">
        {filas.length === 0
          ? '—'
          : filas.map((fila) => (
              <span key={fila.moneda} className="bloque">
                {dinero(fila.total, fila.moneda)}
              </span>
            ))}
      </dd>
    </div>
  );
}

/** Foto del día: el dinero disponible, lo que se movió y las diferencias de arqueo (§5.16). */
export function ResumenDelDia({ resumen }: { resumen: ResumenJornada }) {
  const { remesas } = resumen;
  return (
    <>
      <h3>Dinero disponible</h3>
      <div className="tabla-contenedor">
        <table className="tabla">
          <caption className="solo-lectores">Dinero disponible por cuenta</caption>
          <thead>
            <tr>
              <th scope="col">Cuenta</th>
              <th scope="col">De dónde sale el dato</th>
              <th scope="col" className="tabla__numero">
                Saldo
              </th>
            </tr>
          </thead>
          <tbody>
            {resumen.disponible.map((fila) => (
              <tr key={fila.cuenta.id}>
                <td>
                  {fila.cuenta.nombre}
                  {fila.caja && <small>{fila.caja.nombre}</small>}
                </td>
                <td>{ORIGEN[fila.origen]}</td>
                <td className="tabla__numero mono">
                  {fila.saldo === null ? '—' : dinero(fila.saldo, fila.cuenta.moneda)}
                </td>
              </tr>
            ))}
          </tbody>
          {resumen.totalDisponible.length > 0 && (
            <tfoot>
              {resumen.totalDisponible.map((total) => (
                <tr key={total.moneda}>
                  <th scope="row" colSpan={2}>
                    Total en {total.moneda}
                  </th>
                  <td className="tabla__numero mono">{dinero(total.total, total.moneda)}</td>
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>

      <h3>Lo que pasó en el día</h3>
      <dl className="resumen-dia">
        <div>
          <dt>Remesas</dt>
          <dd>
            {remesas.registradas} registradas · {remesas.completadas} pagadas · {remesas.anuladas}{' '}
            anuladas · {remesas.devueltas} devueltas · {remesas.pendientes} pendientes
          </dd>
        </div>
        <Totales titulo="Pesos recibidos" filas={resumen.pesosRecibidos} />
        <Totales titulo="Devoluciones" filas={resumen.devoluciones} />
        <Totales titulo="Costos bancarios" filas={resumen.costosBancarios} />
        <Totales titulo="Gastos operativos" filas={resumen.gastosOperativos} />
        <Totales titulo="Retiros del dueño" filas={resumen.retirosDelDueno} />
        <div>
          <dt>Traslados</dt>
          <dd>{resumen.traslados}</dd>
        </div>
      </dl>

      {resumen.diferenciasDeArqueo.length > 0 && (
        <>
          <h3>Diferencias de arqueo</h3>
          <div className="tabla-contenedor">
            <table className="tabla">
              <caption className="solo-lectores">Diferencias de arqueo de los turnos</caption>
              <thead>
                <tr>
                  <th scope="col">Caja</th>
                  <th scope="col">Vendedor</th>
                  <th scope="col" className="tabla__numero">
                    Diferencia
                  </th>
                  <th scope="col">Explicación</th>
                </tr>
              </thead>
              <tbody>
                {resumen.diferenciasDeArqueo.map((fila) => (
                  <tr key={`${fila.turnoId}-${fila.moneda}`}>
                    <td>{fila.caja}</td>
                    <td>{fila.vendedor.nombre}</td>
                    <td className="tabla__numero mono">
                      {fila.resultado === 'sobrante' ? 'Sobrante ' : 'Faltante '}
                      {dinero(fila.diferencia, fila.moneda)}
                    </td>
                    <td>{fila.explicacion ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
