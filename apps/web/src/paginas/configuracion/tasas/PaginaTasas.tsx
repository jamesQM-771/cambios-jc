import { useState } from 'react';

import { Aviso } from '../../../componentes/Aviso.js';
import { Cargando } from '../../../componentes/Cargando.js';
import { CampoSelector } from '../../../componentes/CampoSelector.js';
import { mensajeDe } from '../../../lib/api.js';
import { formatearFechaHora } from '../../../lib/formato.js';
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
          <section className="tarjeta">
            <h3>Tasa vigente</h3>
            {vigente.isPending && <Cargando texto="Cargando la tasa vigente…" />}
            {vigente.data?.tasas.length === 0 && <p>Esta línea todavía no tiene tasa publicada.</p>}
            {vigente.data?.tasas[0] && (
              <dl className="datos-registro">
                {lineaElegida.modoTasa === 'porcentaje' && (
                  <>
                    <dt>Tasa del proveedor</dt>
                    <dd>{vigente.data.tasas[0].tasaReferencia}</dd>
                    <dt>Margen usado</dt>
                    <dd>{vigente.data.tasas[0].margenUsado}%</dd>
                  </>
                )}
                {vigente.data.tasas[0].tasaCompra && (
                  <>
                    <dt>Tasa de compra</dt>
                    <dd>{vigente.data.tasas[0].tasaCompra}</dd>
                  </>
                )}
                <dt>Tasa de venta</dt>
                <dd>
                  <strong>{vigente.data.tasas[0].tasaVenta}</strong>
                </dd>
                <dt>Publicada por</dt>
                <dd>{vigente.data.tasas[0].publicadaPorNombre}</dd>
                <dt>Desde</dt>
                <dd>{formatearFechaHora(vigente.data.tasas[0].vigenteDesde, zonaHoraria)}</dd>
              </dl>
            )}
          </section>

          <section className="tarjeta">
            <h3>Publicar tasa</h3>
            <FormularioPublicarTasa
              linea={lineaElegida}
              alPublicar={() => setMensaje('Se publicó la tasa.')}
            />
          </section>

          <section>
            <h3>Historial</h3>
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
                      <th scope="col">Venta</th>
                      <th scope="col">Publicada por</th>
                      <th scope="col">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.data.tasas.map((tasa) => (
                      <tr key={tasa.id}>
                        <td>{formatearFechaHora(tasa.vigenteDesde, zonaHoraria)}</td>
                        <td>
                          {tasa.vigenteHasta
                            ? formatearFechaHora(tasa.vigenteHasta, zonaHoraria)
                            : 'Vigente'}
                        </td>
                        <td>{tasa.tasaVenta}</td>
                        <td>{tasa.publicadaPorNombre}</td>
                        <td>{tasa.motivo ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {historial.data.tasas.length === 0 && <p>No hay tasas publicadas todavía.</p>}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
