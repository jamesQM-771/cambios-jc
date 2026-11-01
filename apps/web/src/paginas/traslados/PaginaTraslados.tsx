import { formatearMoneda, type Moneda } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { CampoAreaTexto } from '../../componentes/CampoAreaTexto.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import { EncabezadoPagina, EstadoVacio, Esqueleto } from '../../componentes/Pagina.js';
import { MENSAJE_PENDIENTE, quedoPendiente } from '../../lib/aprobacion.js';
import { mensajeDe } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/formato.js';
import { useTitulo } from '../../lib/titulo.js';
import { useSesionActual } from '../../modulos/auth/ContextoSesion.js';
import { anularTraslado } from '../../modulos/traslados/api.js';
import {
  CLAVE_TRASLADOS,
  useOpcionesTraslado,
  useTraslados,
} from '../../modulos/traslados/consultas.js';
import type { Traslado } from '../../modulos/traslados/tipos.js';

import { FormularioTraslado } from './FormularioTraslado.js';

/** Traslados: pasar dinero entre la caja, la bóveda y los bancos, siempre dejando rastro (§5.17). */
export function PaginaTraslados() {
  useTitulo('Traslados');
  const notificar = useNotificar();
  const consultas = useQueryClient();
  const { permisos, empresa } = useSesionActual();
  const zona = empresa?.zonaHoraria ?? 'America/Bogota';
  const puedeVerTodos = permisos.includes('traslado.gestionar');
  const [creando, setCreando] = useState(false);
  const [anulando, setAnulando] = useState<Traslado | null>(null);
  const [motivo, setMotivo] = useState('');

  const lista = useTraslados(puedeVerTodos);
  const opciones = useOpcionesTraslado(creando);
  const traslados = lista.data?.traslados ?? [];

  const anular = useMutation({
    mutationFn: () => {
      if (!anulando) throw new Error('Elige un traslado.');
      return anularTraslado(anulando.id, motivo.trim());
    },
    onSuccess: async (respuesta) => {
      setAnulando(null);
      setMotivo('');
      notificar(
        quedoPendiente(respuesta)
          ? MENSAJE_PENDIENTE
          : 'Traslado anulado: el dinero volvió a su cuenta de origen.',
      );
      await consultas.invalidateQueries({ queryKey: CLAVE_TRASLADOS });
    },
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Traslados"
        descripcion="Pasa dinero entre tu caja, la bóveda y los bancos. Cada traslado queda registrado en las dos cuentas."
        acciones={<Boton onClick={() => setCreando(true)}>Nuevo traslado</Boton>}
      />

      {!puedeVerTodos && (
        <p className="campo__ayuda">
          Aquí registras tus traslados. El administrador ve el historial completo.
        </p>
      )}

      {puedeVerTodos && lista.isPending && <Esqueleto texto="Cargando los traslados…" />}
      {puedeVerTodos && lista.isError && <Aviso tipo="error">{mensajeDe(lista.error)}</Aviso>}
      {lista.data && traslados.length === 0 && (
        <EstadoVacio
          titulo="Todavía no hay traslados"
          descripcion='Registra el primero con el botón "Nuevo traslado".'
          icono="flecha"
        />
      )}
      {traslados.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">Traslados</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Sale de</th>
                <th scope="col">Entra a</th>
                <th scope="col" className="tabla__numero">
                  Monto
                </th>
                <th scope="col">Hecho por</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {traslados.map((traslado) => (
                <tr key={traslado.id}>
                  <td>{formatearFechaHora(traslado.creadoEn, zona)}</td>
                  <td>{traslado.origen.nombre}</td>
                  <td>
                    {traslado.destino.nombre}
                    {traslado.nota && <small>{traslado.nota}</small>}
                  </td>
                  <td className="tabla__numero mono">
                    {formatearMoneda(traslado.monto, traslado.origen.moneda as Moneda)}
                  </td>
                  <td>{traslado.creadoPor.nombre}</td>
                  <td>
                    {traslado.anulado ? (
                      <>
                        Anulado
                        <small>{traslado.anulado.motivo}</small>
                      </>
                    ) : (
                      'Vigente'
                    )}
                  </td>
                  <td>
                    {!traslado.anulado && (
                      <Boton
                        variante="secundario"
                        chico
                        aria-label={`Anular el traslado de ${traslado.origen.nombre} a ${traslado.destino.nombre}`}
                        onClick={() => setAnulando(traslado)}
                      >
                        Anular
                      </Boton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialogo abierto={creando} alCerrar={() => setCreando(false)} titulo="Nuevo traslado">
        {creando && opciones.isPending && <Esqueleto texto="Cargando el formulario…" />}
        {creando && opciones.isError && <Aviso tipo="error">{mensajeDe(opciones.error)}</Aviso>}
        {creando && opciones.data && (
          <FormularioTraslado
            opciones={opciones.data}
            alCancelar={() => setCreando(false)}
            alRegistrar={() => {
              setCreando(false);
              notificar('Traslado registrado.');
            }}
          />
        )}
      </Dialogo>

      <Dialogo
        abierto={anulando !== null}
        alCerrar={() => setAnulando(null)}
        titulo="Anular el traslado"
      >
        {anulando && (
          <>
            <p>
              Se devuelven{' '}
              <strong className="mono">
                {formatearMoneda(anulando.monto, anulando.origen.moneda as Moneda)}
              </strong>{' '}
              de <strong>{anulando.destino.nombre}</strong> a{' '}
              <strong>{anulando.origen.nombre}</strong>. El traslado no se borra: queda anulado, con
              tu nombre y el motivo.
            </p>
            {anular.isError && <Aviso tipo="error">{mensajeDe(anular.error)}</Aviso>}
            <CampoAreaTexto
              etiqueta="Motivo"
              rows={3}
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
            />
            <div className="acciones acciones--derecha">
              <Boton
                variante="secundario"
                onClick={() => setAnulando(null)}
                disabled={anular.isPending}
              >
                Volver
              </Boton>
              <Boton
                variante="peligro"
                cargando={anular.isPending}
                disabled={motivo.trim().length < 3}
                onClick={() => anular.mutate()}
              >
                Anular traslado
              </Boton>
            </div>
          </>
        )}
      </Dialogo>
    </>
  );
}
