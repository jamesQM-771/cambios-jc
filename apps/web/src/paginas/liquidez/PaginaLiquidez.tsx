import { formatearMoneda, type Moneda } from '@cambios-jc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import { EncabezadoPagina, Esqueleto } from '../../componentes/Pagina.js';
import { erroresPorCampo, mensajeDe } from '../../lib/api.js';
import { normalizarDecimal } from '../../lib/formato.js';
import { useTitulo } from '../../lib/titulo.js';
import {
  guardarParametrosLiquidez,
  obtenerLiquidez,
  type ParametrosLiquidez,
} from '../../modulos/liquidez/api.js';

const CLAVE = ['liquidez'] as const;
const dinero = (valor: string, moneda: string) => formatearMoneda(valor, moneda as Moneda);

/** Liquidez: bolívares disponibles frente a la cola pendiente, por cuenta y en total (§5.10). */
export function PaginaLiquidez() {
  useTitulo('Liquidez');
  const tablero = useQuery({ queryKey: CLAVE, queryFn: obtenerLiquidez, refetchInterval: 60_000 });
  return (
    <>
      <EncabezadoPagina
        titulo="Liquidez"
        descripcion="Cuántos bolívares hay, cuántos están comprometidos en la cola y cuántos quedan libres. Se actualiza cada minuto."
      />
      {tablero.isPending && <Esqueleto texto="Calculando la liquidez…" />}
      {tablero.isError && <Aviso tipo="error">{mensajeDe(tablero.error)}</Aviso>}
      {tablero.data && (
        <>
          {tablero.data.alertas.map((a) => (
            <Aviso key={a.mensaje} tipo="advertencia">
              {a.mensaje}
            </Aviso>
          ))}
          <div className="tarjetas-resumen">
            {tablero.data.monedas.map((m) => (
              <div key={m.moneda} className="tarjeta" aria-label={`Liquidez en ${m.moneda}`}>
                <p>
                  <strong>Disponible:</strong>{' '}
                  <span className="mono">{dinero(m.disponible, m.moneda)}</span>
                </p>
                <p>
                  <strong>Comprometido en cola:</strong>{' '}
                  <span className="mono">{dinero(m.comprometido, m.moneda)}</span>
                </p>
                <p>
                  <strong>Libre:</strong> <span className="mono">{dinero(m.libre, m.moneda)}</span>
                </p>
              </div>
            ))}
            {tablero.data.comprasEnTransito.length > 0 && (
              <div className="tarjeta" aria-label="Compras en tránsito">
                <p>
                  <strong>Anticipos sin entregar</strong>
                </p>
                {tablero.data.comprasEnTransito.map((c) => (
                  <p key={c.id}>
                    {c.nombre}: <span className="mono">{dinero(c.saldo, 'COP')}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
          {tablero.data.monedas.map((m) => (
            <div key={m.moneda} className="tabla-contenedor">
              <table className="tabla">
                <caption>Cuentas en {m.moneda}</caption>
                <thead>
                  <tr>
                    <th scope="col">Cuenta</th>
                    <th scope="col" className="tabla__numero">
                      Saldo
                    </th>
                    <th scope="col" className="tabla__numero">
                      Usado hoy
                    </th>
                    <th scope="col" className="tabla__numero">
                      Límite restante
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {m.cuentas.map((c) => (
                    <tr key={c.id}>
                      <td>{c.nombre}</td>
                      <td className="tabla__numero mono">{dinero(c.saldo, m.moneda)}</td>
                      <td className="tabla__numero mono">{dinero(c.usadoHoy, m.moneda)}</td>
                      <td className="tabla__numero mono">
                        {c.restanteHoy ? dinero(c.restanteHoy, m.moneda) : 'Sin límite'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <FormularioUmbrales inicial={tablero.data.parametros} />
        </>
      )}
    </>
  );
}

function FormularioUmbrales({ inicial }: { inicial: ParametrosLiquidez }) {
  const notificar = useNotificar();
  const consultas = useQueryClient();
  const [umbral, setUmbral] = useState(inicial.umbralLibre ?? '');
  const [porcentaje, setPorcentaje] = useState(inicial.porcentajeLimite?.toString() ?? '');
  const guardar = useMutation({
    mutationFn: () =>
      guardarParametrosLiquidez({
        umbralLibre: umbral.trim() === '' ? null : normalizarDecimal(umbral),
        porcentajeLimite: porcentaje.trim() === '' ? null : Number.parseInt(porcentaje, 10),
      }),
    onSuccess: async () => {
      notificar('Umbrales guardados.');
      await consultas.invalidateQueries({ queryKey: CLAVE });
    },
  });
  const delServidor = erroresPorCampo(guardar.error);
  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    guardar.mutate();
  };
  return (
    <form className="formulario-ancho" onSubmit={enviar} noValidate>
      <h2>Alertas</h2>
      <p className="campo__ayuda">Un campo vacío apaga la alerta.</p>
      <Campo
        etiqueta="Avisar si los bolívares libres bajan de"
        inputMode="decimal"
        value={umbral}
        onChange={(evento) => setUmbral(evento.target.value)}
        error={delServidor.umbralLibre}
      />
      <Campo
        etiqueta="Avisar cuando una cuenta use este % de su límite diario"
        inputMode="numeric"
        value={porcentaje}
        onChange={(evento) => setPorcentaje(evento.target.value.replace(/\D/g, ''))}
        error={delServidor.porcentajeLimite}
      />
      {guardar.isError && Object.keys(delServidor).length === 0 && (
        <Aviso tipo="error">{mensajeDe(guardar.error)}</Aviso>
      )}
      <div className="acciones">
        <Boton type="submit" cargando={guardar.isPending}>
          Guardar umbrales
        </Boton>
      </div>
    </form>
  );
}
