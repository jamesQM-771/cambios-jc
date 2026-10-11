import { useState } from 'react';

import { Aviso } from '../../../componentes/Aviso.js';
import { Cargando } from '../../../componentes/Cargando.js';
import { CampoSelector } from '../../../componentes/CampoSelector.js';
import { mensajeDe } from '../../../lib/api.js';
import { formatearFechaHora, formatearTasa } from '../../../lib/formato.js';
import { useTitulo } from '../../../lib/titulo.js';
import { useSesionActual } from '../../../modulos/auth/ContextoSesion.js';
import { useLineasNegocio } from '../../../modulos/lineas-negocio/consultas.js';
import { useTasas } from '../../../modulos/tasas/consultas.js';

import { FormularioPublicarTasa } from './FormularioPublicarTasa.js';

const ETIQUETAS_MODO = {
  directo: 'Directo (compra y venta ya calculadas)',
  porcentaje: 'Porcentaje (proveedor + margen)',
} as const;

export function PaginaTasas() {
  useTitulo('Tasas · Configuración');
  const { empresa } = useSesionActual();
  const zonaHoraria = empresa?.zonaHoraria ?? 'America/Bogota';
  const [lineaId, setLineaId] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  const lineas = useLineasNegocio();
  const lineasActivas = (lineas.data?.lineasNegocio ?? []).filter((l) => l.activa);
  const lineaElegida = lineasActivas.find((l) => l.id === lineaId);

  const vigente = useTasas({ lineaNegocioId: lineaId, vigente: true });
  const historial = useTasas({ lineaNegocioId: lineaId });
  const tasaVigente = vigente.data?.tasas[0];

  return (
    <>
      <div className="cabecera-pagina">
        <h2>Tasas</h2>
        <p>Publica la tasa del día de cada línea de negocio. El historial nunca se sobrescribe.</p>
      </div>

      {mensaje && <Aviso tipo="exito">{mensaje}</Aviso>}

      {lineas.isPending && <Cargando texto="Cargando las líneas de negocio…" />}
      {lineas.isError && <Aviso tipo="error">{mensajeDe(lineas.error)}</Aviso>}
      {lineas.data && (
        <CampoSelector
          etiqueta="Línea de negocio"
          value={lineaId}
          onChange={(evento) => setLineaId(evento.target.value)}
        >
          <option value="">Elige una línea…</option>
          {lineasActivas.map((linea) => (
            <option key={linea.id} value={linea.id}>
              {linea.nombre} — {ETIQUETAS_MODO[linea.modoTasa]}
            </option>
          ))}
        </CampoSelector>
      )}

      {lineaElegida && (
        <>
          <div className="dos-columnas">
            <section className="tarjeta" aria-labelledby="titulo-tasa-vigente">
              <div className="tasa-vigente__cabecera">
                <h3 id="titulo-tasa-vigente">Tasa vigente</h3>
                {tasaVigente && <span className="etiqueta etiqueta--exito">Vigente</span>}
              </div>
              {vigente.isPending && <Cargando texto="Cargando la tasa vigente…" />}
              {vigente.data?.tasas.length === 0 && (
                <p className="tasa-vigente__rotulo">Esta línea todavía no tiene tasa publicada.</p>
              )}
              {tasaVigente && (
                <>
                  <p className="tasa-vigente__cifra">{formatearTasa(tasaVigente.tasaVenta)}</p>
                  <p className="tasa-vigente__rotulo">Tasa de venta · {lineaElegida.nombre}</p>
                  <dl className="tasa-vigente__datos">
                    {tasaVigente.tasaReferencia && (
                      <div>
                        <dt>Tasa del proveedor</dt>
                        <dd className="mono">{formatearTasa(tasaVigente.tasaReferencia)}</dd>
                      </div>
                    )}
                    {tasaVigente.margenUsado && (
                      <div>
                        <dt>Margen usado</dt>
                        <dd className="mono">{formatearTasa(tasaVigente.margenUsado, 0)} %</dd>
                      </div>
                    )}
                    {tasaVigente.tasaCompra && (
                      <div>
                        <dt>Tasa de compra</dt>
                        <dd className="mono">{formatearTasa(tasaVigente.tasaCompra)}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Publicada por</dt>
                      <dd>{tasaVigente.publicadaPorNombre}</dd>
                    </div>
                    <div>
                      <dt>Desde</dt>
                      <dd>{formatearFechaHora(tasaVigente.vigenteDesde, zonaHoraria)}</dd>
                    </div>
                  </dl>
                </>
              )}
            </section>

            <section className="tarjeta" aria-labelledby="titulo-publicar-tasa">
              <h3 id="titulo-publicar-tasa">Publicar tasa</h3>
              <FormularioPublicarTasa
                linea={lineaElegida}
                alPublicar={() => setMensaje('Se publicó la tasa.')}
              />
            </section>
          </div>

          <section aria-labelledby="titulo-historial-tasas">
            <h3 id="titulo-historial-tasas">Historial</h3>
            {historial.isPending && <Cargando texto="Cargando el historial…" />}
            {historial.isError && <Aviso tipo="error">{mensajeDe(historial.error)}</Aviso>}
            {historial.data && (
              <div className="tabla-contenedor">
                <table className="tabla">
                  <caption className="solo-lectores">Historial de tasas</caption>
                  <thead>
                    <tr>
                      <th scope="col">Desde</th>
                      <th scope="col">Hasta</th>
                      <th scope="col" className="tabla__numero">
                        {lineaElegida.modoTasa === 'porcentaje' ? 'Proveedor' : 'Compra'}
                      </th>
                      <th scope="col" className="tabla__numero">
                        Venta
                      </th>
                      <th scope="col">Publicada por</th>
                      <th scope="col">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.data.tasas.map((tasa) => {
                      const base =
                        lineaElegida.modoTasa === 'porcentaje'
                          ? tasa.tasaReferencia
                          : tasa.tasaCompra;
                      return (
                        <tr key={tasa.id}>
                          <td>{formatearFechaHora(tasa.vigenteDesde, zonaHoraria)}</td>
                          <td>
                            {tasa.vigenteHasta ? (
                              formatearFechaHora(tasa.vigenteHasta, zonaHoraria)
                            ) : (
                              <span className="etiqueta etiqueta--exito">Vigente</span>
                            )}
                          </td>
                          <td className="tabla__numero mono">{base ? formatearTasa(base) : '—'}</td>
                          <td className="tabla__numero mono">{formatearTasa(tasa.tasaVenta)}</td>
                          <td>{tasa.publicadaPorNombre}</td>
                          <td>{tasa.motivo ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {historial.data.tasas.length === 0 && (
                  <p className="vacio">No hay tasas publicadas todavía.</p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
