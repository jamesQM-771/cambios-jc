import { formatearMoneda, type Moneda } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { MENSAJE_PENDIENTE, quedoPendiente } from '../../lib/aprobacion.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoAreaTexto } from '../../componentes/CampoAreaTexto.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import { EncabezadoPagina, EstadoVacio, Esqueleto } from '../../componentes/Pagina.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
import {
  avisoDecimalAmbiguo,
  formatearFechaHora,
  formatearTasa,
  normalizarDecimal,
} from '../../lib/formato.js';
import { useTitulo } from '../../lib/titulo.js';
import { useSesionActual } from '../../modulos/auth/ContextoSesion.js';
import { ajustarInventario } from '../../modulos/inventario/api.js';
import {
  CLAVE_INVENTARIO,
  useInventarios,
  useMovimientosInventario,
} from '../../modulos/inventario/consultas.js';
import { ETIQUETAS_ORIGEN_INVENTARIO } from '../../modulos/inventario/tipos.js';

/** Inventario de bolívares y su costo promedio ponderado (§7.3). */
export function PaginaInventario() {
  useTitulo('Inventario');
  const notificar = useNotificar();
  const { empresa } = useSesionActual();
  const zona = empresa?.zonaHoraria ?? 'America/Bogota';
  const inventarios = useInventarios();
  const [monedaElegida, setMonedaElegida] = useState<string | null>(null);
  const [ajustando, setAjustando] = useState(false);
  const lista = inventarios.data?.inventarios ?? [];
  const moneda = monedaElegida ?? lista[0]?.moneda ?? null;
  const movimientos = useMovimientosInventario(moneda);

  return (
    <>
      <EncabezadoPagina
        titulo="Inventario"
        descripcion="Cuántos bolívares compraste y aún no has pagado, y a qué costo promedio. Con ese costo se calcula la ganancia de cada remesa."
        acciones={
          moneda ? <Boton onClick={() => setAjustando(true)}>Ajustar inventario</Boton> : undefined
        }
      />

      {inventarios.isPending && <Esqueleto texto="Cargando el inventario…" />}
      {inventarios.isError && <Aviso tipo="error">{mensajeDe(inventarios.error)}</Aviso>}
      {inventarios.data && lista.length === 0 && (
        <EstadoVacio
          titulo="No hay divisas que inventariar"
          descripcion="Crea una cuenta en bolívares en Configuración para empezar."
          icono="panel"
        />
      )}

      {lista.length > 0 && (
        <div className="tarjetas-resumen">
          {lista.map((inv) => (
            <div key={inv.moneda} className="tarjeta" aria-label={`Inventario en ${inv.moneda}`}>
              <p>
                <strong>Inventario:</strong>{' '}
                <span className="mono">{formatearMoneda(inv.cantidad, inv.moneda as Moneda)}</span>
              </p>
              <p>
                <strong>Costo promedio:</strong>{' '}
                <span className="mono">
                  {inv.costoPromedio ? formatearTasa(inv.costoPromedio) : 'Sin costo todavía'}
                </span>
              </p>
              <p>
                <strong>En las cuentas:</strong>{' '}
                <span className="mono">
                  {formatearMoneda(inv.saldoCuentas, inv.moneda as Moneda)}
                </span>
              </p>
              {lista.length > 1 && (
                <Boton variante="secundario" chico onClick={() => setMonedaElegida(inv.moneda)}>
                  Ver historial
                </Boton>
              )}
            </div>
          ))}
        </div>
      )}
      {lista.some((inv) => inv.costoPromedio === null) && (
        <Aviso tipo="advertencia">
          Sin compras ni inventario inicial no hay costo: las remesas que se paguen no tendrán
          ganancia calculada. Carga el inventario inicial con &quot;Ajustar inventario&quot;.
        </Aviso>
      )}

      {moneda && movimientos.data && movimientos.data.movimientos.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption>Historial en {moneda}</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Origen</th>
                <th scope="col" className="tabla__numero">
                  Cantidad
                </th>
                <th scope="col" className="tabla__numero">
                  Tasa
                </th>
                <th scope="col" className="tabla__numero">
                  Inventario
                </th>
                <th scope="col" className="tabla__numero">
                  Costo
                </th>
              </tr>
            </thead>
            <tbody>
              {movimientos.data.movimientos.map((m) => (
                <tr key={m.id}>
                  <td>{formatearFechaHora(m.creadoEn, zona)}</td>
                  <td>
                    {ETIQUETAS_ORIGEN_INVENTARIO[m.origen]}
                    {m.operacion && <small>Remesa N° {m.operacion.numeroComprobante}</small>}
                    {m.nota && <small>{m.nota}</small>}
                  </td>
                  <td className="tabla__numero mono">
                    {m.sentido === 'entrada' ? '+' : '−'}
                    {formatearMoneda(m.cantidad, moneda as Moneda)}
                  </td>
                  <td className="tabla__numero mono">{m.tasa ? formatearTasa(m.tasa) : '—'}</td>
                  <td className="tabla__numero mono">
                    {formatearMoneda(m.cantidadDespues, moneda as Moneda)}
                  </td>
                  <td className="tabla__numero mono">
                    {m.costoDespues ? formatearTasa(m.costoDespues) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialogo abierto={ajustando} alCerrar={() => setAjustando(false)} titulo="Ajustar inventario">
        {ajustando && moneda && (
          <FormularioAjuste
            moneda={moneda}
            alCancelar={() => setAjustando(false)}
            alGuardar={(pendiente) => {
              setAjustando(false);
              notificar(pendiente ? MENSAJE_PENDIENTE : 'Inventario ajustado.');
            }}
          />
        )}
      </Dialogo>
    </>
  );
}

function FormularioAjuste({
  moneda,
  alGuardar,
  alCancelar,
}: {
  moneda: string;
  alGuardar: (pendiente: boolean) => void;
  alCancelar: () => void;
}) {
  const consultas = useQueryClient();
  const [sentido, setSentido] = useState<'entrada' | 'salida'>('entrada');
  const [cantidad, setCantidad] = useState('');
  const [tasa, setTasa] = useState('');
  const [motivo, setMotivo] = useState('');
  const ambiguo = avisoDecimalAmbiguo(cantidad) ?? avisoDecimalAmbiguo(tasa);

  const ajustar = useMutation({
    mutationFn: () =>
      ajustarInventario(moneda, {
        sentido,
        cantidad: normalizarDecimal(cantidad),
        ...(sentido === 'entrada' ? { tasa: normalizarDecimal(tasa) } : {}),
        motivo: motivo.trim(),
      }),
    onSuccess: async (respuesta) => {
      await consultas.invalidateQueries({ queryKey: CLAVE_INVENTARIO });
      alGuardar(quedoPendiente(respuesta));
    },
  });
  const delServidor = erroresPorCampo(ajustar.error);

  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (ambiguo) return;
    ajustar.mutate();
  };

  return (
    <form className="formulario-ancho" onSubmit={enviar} noValidate>
      <p className="campo__ayuda">
        El ajuste corrige lo que el sistema cree que tienes y a qué costo; no mueve dinero de
        ninguna cuenta. Úsalo para el inventario inicial o para corregir un error.
      </p>
      <CampoSelector
        etiqueta="Tipo de ajuste"
        value={sentido}
        onChange={(evento) => setSentido(evento.target.value as 'entrada' | 'salida')}
      >
        <option value="entrada">Entrada (inventario inicial o faltante)</option>
        <option value="salida">Salida (sobrante o pérdida)</option>
      </CampoSelector>
      <Campo
        etiqueta={`Cantidad (${moneda})`}
        inputMode="decimal"
        autoComplete="off"
        value={cantidad}
        onChange={(evento) => setCantidad(evento.target.value)}
        error={delServidor.cantidad ?? avisoDecimalAmbiguo(cantidad) ?? undefined}
      />
      {sentido === 'entrada' && (
        <Campo
          etiqueta="Costo por unidad (tasa)"
          inputMode="decimal"
          autoComplete="off"
          value={tasa}
          onChange={(evento) => setTasa(evento.target.value)}
          error={delServidor.tasa ?? avisoDecimalAmbiguo(tasa) ?? undefined}
        />
      )}
      <CampoAreaTexto
        etiqueta="Motivo"
        rows={2}
        value={motivo}
        onChange={(evento) => setMotivo(evento.target.value)}
      />
      {ajustar.isError && !delServidor.cantidad && !delServidor.tasa && (
        <Aviso tipo="error">{mensajeDe(ajustar.error)}</Aviso>
      )}
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={ajustar.isPending}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={ajustar.isPending}
          disabled={
            cantidad.trim() === '' ||
            (sentido === 'entrada' && tasa.trim() === '') ||
            motivo.trim().length < 3 ||
            ambiguo !== null
          }
        >
          Guardar ajuste
        </Boton>
      </div>
    </form>
  );
}
