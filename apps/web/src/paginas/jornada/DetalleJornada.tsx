import { formatearMoneda, type Moneda } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { CampoAreaTexto } from '../../componentes/CampoAreaTexto.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import { Esqueleto } from '../../componentes/Pagina.js';
import { MENSAJE_PENDIENTE, quedoPendiente } from '../../lib/aprobacion.js';
import { mensajeDe } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/formato.js';
import { useSesionActual } from '../../modulos/auth/ContextoSesion.js';
import { reabrirJornada } from '../../modulos/jornadas/api.js';
import { CLAVE_JORNADAS, useDetalleJornada } from '../../modulos/jornadas/consultas.js';
import { useOpcionesTurno } from '../../modulos/turnos/consultas.js';
import type { Turno } from '../../modulos/turnos/tipos.js';
import { FormularioCierre } from '../turno/FormularioCierre.js';

import { FormularioCierreJornada } from './FormularioCierreJornada.js';
import { ResumenDelDia } from './ResumenDelDia.js';

const ETIQUETA_RESULTADO = { cuadrado: 'Cuadra', sobrante: 'Sobrante', faltante: 'Faltante' };

/** Una jornada por dentro: qué la impide cerrar, el arqueo de cuentas, el resumen y su historia. */
export function DetalleJornada({ id }: { id: string }) {
  const notificar = useNotificar();
  const consultas = useQueryClient();
  const { usuario, empresa } = useSesionActual();
  const zona = empresa?.zonaHoraria ?? 'America/Bogota';
  const consulta = useDetalleJornada(id);
  const opciones = useOpcionesTurno();
  const [cerrandoTurno, setCerrandoTurno] = useState<{ id: string; caja: string } | null>(null);
  const [esDeOtro, setEsDeOtro] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);
  const [motivo, setMotivo] = useState('');

  const reabrir = useMutation({
    mutationFn: () => reabrirJornada(id, motivo.trim()),
    onSuccess: async (respuesta) => {
      setReabriendo(false);
      setMotivo('');
      notificar(quedoPendiente(respuesta) ? MENSAJE_PENDIENTE : 'Jornada reabierta.');
      await consultas.invalidateQueries({ queryKey: CLAVE_JORNADAS });
    },
  });

  if (consulta.isPending) return <Esqueleto texto="Cargando la jornada…" />;
  if (consulta.isError) return <Aviso tipo="error">{mensajeDe(consulta.error)}</Aviso>;

  const { jornada, pendientes, resumen, saldosReportados, eventos } = consulta.data.detalle;
  const abierta = jornada.estado === 'abierta';
  const cajaDelTurno = cerrandoTurno
    ? opciones.data?.cajas.find((caja) => caja.nombre === cerrandoTurno.caja)
    : undefined;

  return (
    <>
      <p>
        Jornada del <strong>{jornada.fecha}</strong> · {jornada.sucursal.nombre} ·{' '}
        {abierta ? 'abierta' : 'cerrada'}
        {jornada.ciclo > 1 ? ` (reabierta ${String(jornada.ciclo - 1)} vez)` : ''}
      </p>

      {abierta && (
        <section aria-labelledby="titulo-pendientes">
          <h3 id="titulo-pendientes">Lo que falta para cerrar</h3>
          {pendientes.turnosAbiertos.length === 0 && pendientes.remesasTomadas === 0 && (
            <p>No hay turnos abiertos ni pagos a medias.</p>
          )}
          {pendientes.remesasTomadas > 0 && (
            <Aviso tipo="advertencia">
              Hay {pendientes.remesasTomadas} remesas que un digitador tomó y todavía no termina.
            </Aviso>
          )}
          {pendientes.turnosAbiertos.length > 0 && (
            <ul className="lista-simple">
              {pendientes.turnosAbiertos.map((turno) => (
                <li key={turno.id}>
                  <strong>{turno.caja}</strong>: turno abierto de {turno.vendedor.nombre}{' '}
                  <Boton
                    variante="secundario"
                    chico
                    aria-label={`Cerrar el turno de ${turno.vendedor.nombre} en ${turno.caja}`}
                    onClick={() => {
                      setEsDeOtro(turno.vendedor.id !== usuario.id);
                      setCerrandoTurno({ id: turno.id, caja: turno.caja });
                    }}
                  >
                    Cerrar turno
                  </Boton>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {abierta && (
        <FormularioCierreJornada
          detalle={consulta.data.detalle}
          alCerrar={() => notificar('Jornada cerrada.')}
        />
      )}

      {!abierta && (
        <section aria-labelledby="titulo-saldos">
          <h3 id="titulo-saldos">Arqueo de cuentas al cerrar</h3>
          {jornada.cerradaPor && jornada.cerradaEn && (
            <p>
              Cerrada por {jornada.cerradaPor.nombre} el{' '}
              {formatearFechaHora(jornada.cerradaEn, zona)}.
            </p>
          )}
          <div className="tabla-contenedor">
            <table className="tabla">
              <caption className="solo-lectores">Saldos reportados al cerrar</caption>
              <thead>
                <tr>
                  <th scope="col">Cuenta</th>
                  <th scope="col" className="tabla__numero">
                    Esperado
                  </th>
                  <th scope="col" className="tabla__numero">
                    Reportado
                  </th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {saldosReportados.map((saldo) => (
                  <tr key={saldo.cuenta.id}>
                    <td>
                      {saldo.cuenta.nombre}
                      {saldo.explicacion && <small>{saldo.explicacion}</small>}
                    </td>
                    <td className="tabla__numero mono">
                      {saldo.esperado === null
                        ? '—'
                        : formatearMoneda(saldo.esperado, saldo.cuenta.moneda as Moneda)}
                    </td>
                    <td className="tabla__numero mono">
                      {formatearMoneda(saldo.reportado, saldo.cuenta.moneda as Moneda)}
                    </td>
                    <td>
                      {saldo.resultado ? ETIQUETA_RESULTADO[saldo.resultado] : 'Primer arqueo'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="acciones">
            <Boton variante="peligro" onClick={() => setReabriendo(true)}>
              Reabrir la jornada
            </Boton>
          </div>
        </section>
      )}

      <ResumenDelDia resumen={resumen} />

      {eventos.length > 0 && (
        <section aria-labelledby="titulo-eventos">
          <h3 id="titulo-eventos">Historia de la jornada</h3>
          <ul className="lista-simple">
            {eventos.map((evento) => (
              <li key={`${evento.tipo}-${evento.creadoEn}`}>
                {evento.tipo === 'cierre' ? 'Cerrada' : 'Reabierta'} por {evento.usuario.nombre} el{' '}
                {formatearFechaHora(evento.creadoEn, zona)}
                {evento.motivo ? `: ${evento.motivo}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialogo
        abierto={cerrandoTurno !== null}
        alCerrar={() => setCerrandoTurno(null)}
        titulo="Cerrar turno"
        ancho
      >
        {cerrandoTurno && !cajaDelTurno && opciones.isPending && (
          <Esqueleto texto="Cargando la caja…" />
        )}
        {cerrandoTurno && !cajaDelTurno && !opciones.isPending && (
          <Aviso tipo="error">No se encontró la caja de ese turno.</Aviso>
        )}
        {cerrandoTurno && cajaDelTurno && (
          <FormularioCierre
            turno={{
              id: cerrandoTurno.id,
              caja: { id: cajaDelTurno.id, nombre: cerrandoTurno.caja },
            }}
            pedirMotivo={esDeOtro}
            monedas={cajaDelTurno.monedas}
            alCancelar={() => setCerrandoTurno(null)}
            alCerrar={(turno: Turno) => {
              setCerrandoTurno(null);
              notificar(`Turno de ${turno.caja.nombre} cerrado.`);
              void consultas.invalidateQueries({ queryKey: CLAVE_JORNADAS });
            }}
          />
        )}
      </Dialogo>

      <Dialogo
        abierto={reabriendo}
        alCerrar={() => setReabriendo(false)}
        titulo="Reabrir la jornada"
      >
        <p>
          La jornada vuelve a quedar abierta para registrar lo que falte. Su cierre anterior no se
          borra: queda en la historia, con tu nombre y el motivo.
        </p>
        {reabrir.isError && <Aviso tipo="error">{mensajeDe(reabrir.error)}</Aviso>}
        <CampoAreaTexto
          etiqueta="Motivo"
          rows={3}
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
        />
        <div className="acciones acciones--derecha">
          <Boton
            variante="secundario"
            onClick={() => setReabriendo(false)}
            disabled={reabrir.isPending}
          >
            Volver
          </Boton>
          <Boton
            variante="peligro"
            cargando={reabrir.isPending}
            disabled={motivo.trim().length < 3}
            onClick={() => reabrir.mutate()}
          >
            Reabrir jornada
          </Boton>
        </div>
      </Dialogo>
    </>
  );
}
