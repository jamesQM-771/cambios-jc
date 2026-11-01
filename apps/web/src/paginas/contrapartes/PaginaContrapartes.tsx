import { formatearMoneda, type Moneda } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { CampoAreaTexto } from '../../componentes/CampoAreaTexto.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import {
  BarraHerramientas,
  EncabezadoPagina,
  EstadoVacio,
  Esqueleto,
} from '../../componentes/Pagina.js';
import { MENSAJE_PENDIENTE } from '../../lib/aprobacion.js';
import { mensajeDe } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/formato.js';
import { useTitulo } from '../../lib/titulo.js';
import { useSesionActual } from '../../modulos/auth/ContextoSesion.js';
import { anularMovimiento } from '../../modulos/contrapartes/api.js';
import {
  CLAVE_CONTRAPARTES,
  useContrapartes,
  useDetalleContraparte,
  useOpcionesContraparte,
  useResumenContrapartes,
} from '../../modulos/contrapartes/consultas.js';
import { etiquetaSaldo } from '../../modulos/contrapartes/saldo.js';
import {
  ETIQUETAS_MOVIMIENTO,
  ETIQUETAS_TIPO_CONTRAPARTE,
  type Contraparte,
  type MovimientoContraparte,
} from '../../modulos/contrapartes/tipos.js';

import { FormularioContraparte } from './FormularioContraparte.js';
import { FormularioMovimiento } from './FormularioMovimiento.js';

type Filtro = '' | 'me_deben' | 'les_debo';

/** Contrapartes: las deudas del negocio separadas del dinero disponible (§5.8). */
export function PaginaContrapartes() {
  useTitulo('Contrapartes');
  const notificar = useNotificar();
  const [filtro, setFiltro] = useState<Filtro>('');
  const [creando, setCreando] = useState(false);
  const [abiertaId, setAbiertaId] = useState<string | null>(null);

  const lista = useContrapartes(filtro === '' ? undefined : filtro);
  const resumen = useResumenContrapartes();
  const contrapartes = lista.data?.contrapartes ?? [];

  return (
    <>
      <EncabezadoPagina
        titulo="Contrapartes"
        descripcion="Préstamos, abonos, anticipos y compras a crédito con cada persona o negocio. Lo que te deben y lo que debes, aparte del dinero disponible."
        acciones={<Boton onClick={() => setCreando(true)}>Nueva contraparte</Boton>}
      />

      {resumen.data && resumen.data.resumen.length > 0 && (
        <div className="tarjetas-resumen" aria-label="Totales de contrapartes">
          {resumen.data.resumen.map((fila) => (
            <div key={fila.moneda} className="tarjeta">
              <p>
                <strong>Me deben:</strong>{' '}
                <span className="mono">{formatearMoneda(fila.meDeben, fila.moneda as Moneda)}</span>
              </p>
              <p>
                <strong>Les debo:</strong>{' '}
                <span className="mono">{formatearMoneda(fila.lesDebo, fila.moneda as Moneda)}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      <BarraHerramientas
        resumen={lista.data ? `${String(contrapartes.length)} contrapartes` : undefined}
      >
        <CampoSelector
          etiqueta="Mostrar"
          value={filtro}
          onChange={(evento) => setFiltro(evento.target.value as Filtro)}
        >
          <option value="">Todas</option>
          <option value="me_deben">Me deben</option>
          <option value="les_debo">Les debo</option>
        </CampoSelector>
      </BarraHerramientas>

      {lista.isPending && <Esqueleto texto="Cargando las contrapartes…" />}
      {lista.isError && <Aviso tipo="error">{mensajeDe(lista.error)}</Aviso>}
      {lista.data && contrapartes.length === 0 && (
        <EstadoVacio
          titulo={filtro === '' ? 'Todavía no hay contrapartes' : 'Nadie en esta lista'}
          descripcion={
            filtro === ''
              ? 'Registra a tus proveedores de bolívares, socios o familiares con quienes llevas cuentas.'
              : undefined
          }
          icono="usuarios"
        />
      )}
      {contrapartes.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">Contrapartes</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Tipo</th>
                <th scope="col">Saldo</th>
                <th scope="col">
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {contrapartes.map((contraparte) => (
                <tr key={contraparte.id}>
                  <td>
                    {contraparte.nombre}
                    {!contraparte.activa && <small>Desactivada</small>}
                  </td>
                  <td>{ETIQUETAS_TIPO_CONTRAPARTE[contraparte.tipo]}</td>
                  <td className="mono">
                    {contraparte.saldos.length === 0
                      ? 'A paz y salvo'
                      : contraparte.saldos.map((s) => (
                          <span key={s.moneda} className="bloque">
                            {etiquetaSaldo(s.moneda, s.saldo)}
                          </span>
                        ))}
                  </td>
                  <td>
                    <Boton
                      variante="secundario"
                      chico
                      aria-label={`Ver la cuenta de ${contraparte.nombre}`}
                      onClick={() => setAbiertaId(contraparte.id)}
                    >
                      Ver cuenta
                    </Boton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialogo abierto={creando} alCerrar={() => setCreando(false)} titulo="Nueva contraparte">
        {creando && (
          <FormularioContraparte
            alCancelar={() => setCreando(false)}
            alGuardar={() => {
              setCreando(false);
              notificar('Contraparte creada.');
            }}
          />
        )}
      </Dialogo>

      <Dialogo
        abierto={abiertaId !== null}
        alCerrar={() => setAbiertaId(null)}
        titulo="Cuenta corriente"
      >
        {abiertaId && <DetalleContraparte id={abiertaId} />}
      </Dialogo>
    </>
  );
}

type Vista = 'historial' | 'movimiento' | 'editar';

function DetalleContraparte({ id }: { id: string }) {
  const notificar = useNotificar();
  const consultas = useQueryClient();
  const { empresa } = useSesionActual();
  const zona = empresa?.zonaHoraria ?? 'America/Bogota';
  const detalle = useDetalleContraparte(id);
  const [vista, setVista] = useState<Vista>('historial');
  const [anulando, setAnulando] = useState<MovimientoContraparte | null>(null);
  const [motivo, setMotivo] = useState('');
  const opciones = useOpcionesContraparte(vista === 'movimiento');

  const anular = useMutation({
    mutationFn: () => {
      if (!anulando) throw new Error('Elige un movimiento.');
      return anularMovimiento(anulando.id, motivo.trim());
    },
    onSuccess: async () => {
      setAnulando(null);
      setMotivo('');
      notificar('Movimiento anulado.');
      await consultas.invalidateQueries({ queryKey: CLAVE_CONTRAPARTES });
    },
  });

  if (detalle.isPending) return <Esqueleto texto="Cargando la cuenta…" />;
  if (detalle.isError) return <Aviso tipo="error">{mensajeDe(detalle.error)}</Aviso>;
  const { contraparte, movimientos } = detalle.data;

  if (vista === 'editar') {
    return (
      <FormularioContraparte
        contraparte={contraparte}
        alCancelar={() => setVista('historial')}
        alGuardar={() => {
          setVista('historial');
          notificar('Contraparte actualizada.');
        }}
      />
    );
  }
  if (vista === 'movimiento') {
    if (opciones.isPending) return <Esqueleto texto="Cargando el formulario…" />;
    if (opciones.isError) return <Aviso tipo="error">{mensajeDe(opciones.error)}</Aviso>;
    return (
      <FormularioMovimiento
        contraparteId={contraparte.id}
        opciones={opciones.data}
        alCancelar={() => setVista('historial')}
        alRegistrar={(pendiente) => {
          setVista('historial');
          notificar(pendiente ? MENSAJE_PENDIENTE : 'Movimiento registrado.');
        }}
      />
    );
  }

  return (
    <>
      <CabeceraContraparte contraparte={contraparte} />
      <div className="acciones">
        <Boton onClick={() => setVista('movimiento')} disabled={!contraparte.activa}>
          Nuevo movimiento
        </Boton>
        <Boton variante="secundario" onClick={() => setVista('editar')}>
          Editar datos
        </Boton>
      </div>
      {movimientos.length === 0 ? (
        <p className="campo__ayuda">Todavía no tiene movimientos.</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">Movimientos de {contraparte.nombre}</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Movimiento</th>
                <th scope="col" className="tabla__numero">
                  Monto
                </th>
                <th scope="col">Efecto</th>
                <th scope="col">
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td>{formatearFechaHora(m.creadoEn, zona)}</td>
                  <td>
                    {m.revierteId ? 'Anulación' : ETIQUETAS_MOVIMIENTO[m.tipo]}
                    {m.cuenta && <small>Por {m.cuenta.nombre}</small>}
                    {m.nota && <small>{m.nota}</small>}
                    {m.anulacion && <small>Anulado: {m.anulacion.motivo}</small>}
                  </td>
                  <td className="tabla__numero mono">
                    {formatearMoneda(m.monto, m.moneda as Moneda)}
                  </td>
                  <td>{m.signo === 1 ? 'Me debe más' : 'Le debo más'}</td>
                  <td>
                    {!m.revierteId && !m.anulacion && !m.compraId && (
                      <Boton
                        variante="secundario"
                        chico
                        aria-label={`Anular ${ETIQUETAS_MOVIMIENTO[m.tipo]}`}
                        onClick={() => setAnulando(m)}
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

      {anulando && (
        <div className="seccion-formulario" role="group" aria-label="Anular el movimiento">
          <p>
            Se agrega el movimiento contrario
            {anulando.cuenta ? ` y el dinero vuelve a ${anulando.cuenta.nombre}` : ''}. Nada se
            borra.
          </p>
          {anular.isError && <Aviso tipo="error">{mensajeDe(anular.error)}</Aviso>}
          <CampoAreaTexto
            etiqueta="Motivo"
            rows={2}
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
          />
          <div className="acciones acciones--derecha">
            <Boton variante="secundario" onClick={() => setAnulando(null)}>
              Volver
            </Boton>
            <Boton
              variante="peligro"
              cargando={anular.isPending}
              disabled={motivo.trim().length < 3}
              onClick={() => anular.mutate()}
            >
              Anular movimiento
            </Boton>
          </div>
        </div>
      )}
    </>
  );
}

function CabeceraContraparte({ contraparte }: { contraparte: Contraparte }) {
  return (
    <div>
      <h3>{contraparte.nombre}</h3>
      <p className="campo__ayuda">
        {ETIQUETAS_TIPO_CONTRAPARTE[contraparte.tipo]}
        {contraparte.documento ? ` · ${contraparte.documento}` : ''}
        {contraparte.telefono ? ` · ${contraparte.telefono}` : ''}
        {!contraparte.activa ? ' · Desactivada' : ''}
      </p>
      <p className="mono">
        {contraparte.saldos.length === 0
          ? 'A paz y salvo'
          : contraparte.saldos.map((s) => etiquetaSaldo(s.moneda, s.saldo)).join(' · ')}
      </p>
      {contraparte.cuentasTitular.length > 0 && (
        <p className="campo__ayuda">
          Cuentas a su nombre: {contraparte.cuentasTitular.map((c) => c.nombre).join(', ')}
        </p>
      )}
    </div>
  );
}
