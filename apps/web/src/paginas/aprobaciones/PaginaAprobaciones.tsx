import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { CampoAreaTexto } from '../../componentes/CampoAreaTexto.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import { EncabezadoPagina, EstadoVacio, Esqueleto } from '../../componentes/Pagina.js';
import { mensajeDe } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/formato.js';
import { useTitulo } from '../../lib/titulo.js';
import {
  aprobarSolicitud,
  ETIQUETAS_ACCION,
  guardarParametrosDobleControl,
  listarSolicitudes,
  obtenerParametrosDobleControl,
  rechazarSolicitud,
  type ParametrosDobleControl,
  type Solicitud,
} from '../../modulos/aprobaciones.js';
import { useSesionActual } from '../../modulos/auth/ContextoSesion.js';

const CLAVE = ['aprobaciones'] as const;

const OPCIONES: [keyof ParametrosDobleControl, string][] = [
  ['reaperturaJornada', 'Reabrir una jornada cerrada'],
  ['devoluciones', 'Devolver el dinero de una remesa'],
  ['anulaciones', 'Anular remesas, divisas, compras, gastos y traslados'],
  ['ajustes', 'Ajustes de contrapartes y de inventario'],
];

/** Bandeja de doble control (§5.12): nadie aprueba su propia solicitud. */
export function PaginaAprobaciones() {
  useTitulo('Aprobaciones');
  const notificar = useNotificar();
  const consultas = useQueryClient();
  const { usuario, empresa, permisos } = useSesionActual();
  const zona = empresa?.zonaHoraria ?? 'America/Bogota';
  const [estado, setEstado] = useState<Solicitud['estado'] | ''>('pendiente');
  const [rechazando, setRechazando] = useState<Solicitud | null>(null);
  const [comentario, setComentario] = useState('');
  const solicitudes = useQuery({
    queryKey: [...CLAVE, estado],
    queryFn: () => listarSolicitudes(estado === '' ? undefined : estado),
  });
  const refrescar = () => consultas.invalidateQueries();

  const aprobar = useMutation({
    mutationFn: (id: string) => aprobarSolicitud(id),
    onSuccess: async () => {
      notificar('Aprobada y ejecutada.');
      await refrescar();
    },
  });
  const rechazar = useMutation({
    mutationFn: () => {
      if (!rechazando) throw new Error('Elige una solicitud.');
      return rechazarSolicitud(rechazando.id, comentario.trim());
    },
    onSuccess: async () => {
      setRechazando(null);
      setComentario('');
      notificar('Solicitud rechazada.');
      await refrescar();
    },
  });
  const lista = solicitudes.data?.solicitudes ?? [];

  return (
    <>
      <EncabezadoPagina
        titulo="Aprobaciones"
        descripcion="Acciones delicadas que pidió otra persona. Al aprobar, se ejecutan con tu nombre; nadie aprueba lo que pidió."
      />
      <CampoSelector
        etiqueta="Estado"
        value={estado}
        onChange={(evento) => setEstado(evento.target.value as Solicitud['estado'] | '')}
      >
        <option value="pendiente">Pendientes</option>
        <option value="aprobada">Aprobadas</option>
        <option value="rechazada">Rechazadas</option>
        <option value="">Todas</option>
      </CampoSelector>
      {aprobar.isError && <Aviso tipo="error">{mensajeDe(aprobar.error)}</Aviso>}
      {solicitudes.isPending && <Esqueleto texto="Cargando las solicitudes…" />}
      {solicitudes.isError && <Aviso tipo="error">{mensajeDe(solicitudes.error)}</Aviso>}
      {solicitudes.data && lista.length === 0 && (
        <EstadoVacio titulo="No hay solicitudes en esta lista" icono="info" />
      )}
      {lista.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">Solicitudes de aprobación</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Acción</th>
                <th scope="col">Pidió</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => {
                const propia = s.solicitante.id === usuario.id;
                return (
                  <tr key={s.id}>
                    <td>{formatearFechaHora(s.creadoEn, zona)}</td>
                    <td>
                      {ETIQUETAS_ACCION[s.accion]}
                      <small>{s.descripcion}</small>
                    </td>
                    <td>{s.solicitante.nombre}</td>
                    <td>
                      {s.estado === 'pendiente'
                        ? 'Pendiente'
                        : `${s.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'} por ${s.aprobador?.nombre ?? ''}`}
                      {s.comentario && <small>{s.comentario}</small>}
                    </td>
                    <td>
                      {s.estado === 'pendiente' &&
                        (propia ? (
                          <small>Tu solicitud: la aprueba otra persona</small>
                        ) : (
                          <div className="acciones">
                            <Boton
                              chico
                              aria-label={`Aprobar: ${ETIQUETAS_ACCION[s.accion]}`}
                              cargando={aprobar.isPending && aprobar.variables === s.id}
                              onClick={() => aprobar.mutate(s.id)}
                            >
                              Aprobar
                            </Boton>
                            <Boton
                              variante="secundario"
                              chico
                              aria-label={`Rechazar: ${ETIQUETAS_ACCION[s.accion]}`}
                              onClick={() => setRechazando(s)}
                            >
                              Rechazar
                            </Boton>
                          </div>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {permisos.includes('empresa.configurar') && <ParametrosDobleControlFormulario />}

      <Dialogo
        abierto={rechazando !== null}
        alCerrar={() => setRechazando(null)}
        titulo="Rechazar la solicitud"
      >
        {rechazando && (
          <>
            <p>{rechazando.descripcion}</p>
            {rechazar.isError && <Aviso tipo="error">{mensajeDe(rechazar.error)}</Aviso>}
            <CampoAreaTexto
              etiqueta="Motivo del rechazo"
              rows={3}
              value={comentario}
              onChange={(evento) => setComentario(evento.target.value)}
            />
            <div className="acciones acciones--derecha">
              <Boton variante="secundario" onClick={() => setRechazando(null)}>
                Volver
              </Boton>
              <Boton
                variante="peligro"
                cargando={rechazar.isPending}
                disabled={comentario.trim().length < 3}
                onClick={() => rechazar.mutate()}
              >
                Rechazar
              </Boton>
            </div>
          </>
        )}
      </Dialogo>
    </>
  );
}

function ParametrosDobleControlFormulario() {
  const notificar = useNotificar();
  const consultas = useQueryClient();
  const parametros = useQuery({
    queryKey: [...CLAVE, 'parametros'],
    queryFn: obtenerParametrosDobleControl,
  });
  const guardar = useMutation({
    mutationFn: (datos: ParametrosDobleControl) => guardarParametrosDobleControl(datos),
    onSuccess: async () => {
      notificar('Doble control actualizado.');
      await consultas.invalidateQueries({ queryKey: CLAVE });
    },
  });
  if (!parametros.data) return null;
  const actuales = parametros.data.parametros;
  return (
    <fieldset className="seccion-formulario">
      <legend className="seccion-formulario__titulo">Qué pide aprobación</legend>
      <p className="seccion-formulario__descripcion">
        Con una sola persona administrando no hay quién apruebe: enciéndelo cuando haya dos.
      </p>
      {guardar.isError && <Aviso tipo="error">{mensajeDe(guardar.error)}</Aviso>}
      {OPCIONES.map(([clave, etiqueta]) => (
        <label key={clave} className="campo__casilla">
          <input
            type="checkbox"
            checked={actuales[clave]}
            disabled={guardar.isPending}
            onChange={(evento) => guardar.mutate({ ...actuales, [clave]: evento.target.checked })}
          />
          {etiqueta}
        </label>
      ))}
    </fieldset>
  );
}
