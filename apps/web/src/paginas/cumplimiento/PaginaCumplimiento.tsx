import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoAreaTexto } from '../../componentes/CampoAreaTexto.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import { EncabezadoPagina, EstadoVacio, Esqueleto } from '../../componentes/Pagina.js';
import { erroresPorCampo, mensajeDe, urlApi } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/formato.js';
import { useTitulo } from '../../lib/titulo.js';
import { useSesionActual } from '../../modulos/auth/ContextoSesion.js';
import {
  cambiarEntrada,
  crearEntrada,
  guardarParametros,
  resolverAlerta,
} from '../../modulos/cumplimiento/api.js';
import {
  CLAVE_CUMPLIMIENTO,
  useAlertas,
  useListaRestrictiva,
  useParametros,
} from '../../modulos/cumplimiento/consultas.js';
import {
  ETIQUETAS_ALERTA,
  ETIQUETAS_ESTADO_ALERTA,
  ETIQUETAS_FUENTE,
  type Alerta,
  type EntradaLista,
  type EstadoAlerta,
  type Parametros,
} from '../../modulos/cumplimiento/tipos.js';

type Seccion = 'alertas' | 'lista' | 'parametros' | 'exporte';

const SECCIONES: [Seccion, string][] = [
  ['alertas', 'Alertas'],
  ['lista', 'Lista restrictiva'],
  ['parametros', 'Parámetros'],
  ['exporte', 'Exportar'],
];

/** Cumplimiento SARLAFT/UIAF: bandeja de alertas, lista restrictiva, parámetros y exportes (§5.13). */
export function PaginaCumplimiento() {
  useTitulo('Cumplimiento');
  const [seccion, setSeccion] = useState<Seccion>('alertas');
  return (
    <>
      <EncabezadoPagina
        titulo="Cumplimiento"
        descripcion="Alertas por revisar, lista restrictiva y reglas. Los umbrales están apagados hasta definirlos con el contador."
      />
      <div className="acciones" role="tablist" aria-label="Secciones de cumplimiento">
        {SECCIONES.map(([valor, etiqueta]) => (
          <Boton
            key={valor}
            role="tab"
            aria-selected={seccion === valor}
            variante={seccion === valor ? 'primario' : 'secundario'}
            chico
            onClick={() => setSeccion(valor)}
          >
            {etiqueta}
          </Boton>
        ))}
      </div>
      {seccion === 'alertas' && <BandejaAlertas />}
      {seccion === 'lista' && <ListaRestrictiva />}
      {seccion === 'parametros' && <FormularioParametros />}
      {seccion === 'exporte' && <Exporte />}
    </>
  );
}

function BandejaAlertas() {
  const notificar = useNotificar();
  const consultas = useQueryClient();
  const { empresa } = useSesionActual();
  const zona = empresa?.zonaHoraria ?? 'America/Bogota';
  const [estado, setEstado] = useState<EstadoAlerta | ''>('abierta');
  const [revisando, setRevisando] = useState<Alerta | null>(null);
  const [justificacion, setJustificacion] = useState('');
  const alertas = useAlertas(estado === '' ? undefined : estado);

  const resolver = useMutation({
    mutationFn: (accion: 'descartar' | 'escalar') => {
      if (!revisando) throw new Error('Elige una alerta.');
      return resolverAlerta(revisando.id, accion, justificacion.trim());
    },
    onSuccess: async ({ alerta }) => {
      setRevisando(null);
      setJustificacion('');
      notificar(alerta.estado === 'escalada' ? 'Alerta escalada.' : 'Alerta descartada.');
      await consultas.invalidateQueries({ queryKey: CLAVE_CUMPLIMIENTO });
    },
  });

  const lista = alertas.data?.alertas ?? [];
  return (
    <>
      <CampoSelector
        etiqueta="Estado"
        value={estado}
        onChange={(evento) => setEstado(evento.target.value as EstadoAlerta | '')}
      >
        <option value="abierta">Abiertas</option>
        <option value="escalada">Escaladas</option>
        <option value="descartada">Descartadas</option>
        <option value="">Todas</option>
      </CampoSelector>
      {alertas.isPending && <Esqueleto texto="Cargando las alertas…" />}
      {alertas.isError && <Aviso tipo="error">{mensajeDe(alertas.error)}</Aviso>}
      {alertas.data && lista.length === 0 && (
        <EstadoVacio titulo="No hay alertas en esta lista" icono="info" />
      )}
      {lista.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">Alertas de cumplimiento</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Alerta</th>
                <th scope="col">Cliente</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a.id}>
                  <td>{formatearFechaHora(a.creadoEn, zona)}</td>
                  <td>
                    {ETIQUETAS_ALERTA[a.tipo]}
                    {a.operacion && <small>Remesa N° {a.operacion.numeroComprobante}</small>}
                  </td>
                  <td>
                    {a.cliente.nombre}
                    <small>
                      {a.cliente.tipoDocumento} {a.cliente.numeroDocumento}
                    </small>
                  </td>
                  <td>
                    {ETIQUETAS_ESTADO_ALERTA[a.estado]}
                    {a.justificacion && <small>{a.justificacion}</small>}
                  </td>
                  <td>
                    {a.estado !== 'descartada' && (
                      <Boton
                        variante="secundario"
                        chico
                        aria-label={`Revisar la alerta de ${a.cliente.nombre}`}
                        onClick={() => setRevisando(a)}
                      >
                        Revisar
                      </Boton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialogo
        abierto={revisando !== null}
        alCerrar={() => setRevisando(null)}
        titulo="Revisar la alerta"
      >
        {revisando && (
          <>
            <p>
              <strong>{ETIQUETAS_ALERTA[revisando.tipo]}</strong> · {revisando.cliente.nombre}
            </p>
            <pre className="mono">{JSON.stringify(revisando.detalle, null, 2)}</pre>
            {resolver.isError && <Aviso tipo="error">{mensajeDe(resolver.error)}</Aviso>}
            <CampoAreaTexto
              etiqueta="Justificación"
              rows={3}
              value={justificacion}
              onChange={(evento) => setJustificacion(evento.target.value)}
            />
            <div className="acciones acciones--derecha">
              {revisando.estado === 'abierta' && (
                <Boton
                  variante="secundario"
                  disabled={justificacion.trim().length < 5}
                  cargando={resolver.isPending && resolver.variables === 'escalar'}
                  onClick={() => resolver.mutate('escalar')}
                >
                  Escalar
                </Boton>
              )}
              <Boton
                disabled={justificacion.trim().length < 5}
                cargando={resolver.isPending && resolver.variables === 'descartar'}
                onClick={() => resolver.mutate('descartar')}
              >
                Descartar
              </Boton>
            </div>
          </>
        )}
      </Dialogo>
    </>
  );
}

function ListaRestrictiva() {
  const notificar = useNotificar();
  const consultas = useQueryClient();
  const lista = useListaRestrictiva(true);
  const [fuente, setFuente] = useState<EntradaLista['fuente']>('propia');
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [nota, setNota] = useState('');
  const refrescar = () => consultas.invalidateQueries({ queryKey: CLAVE_CUMPLIMIENTO });

  const agregar = useMutation({
    mutationFn: () =>
      crearEntrada({
        fuente,
        nombre: nombre.trim(),
        numeroDocumento: documento.trim() || null,
        nota: nota.trim() || null,
      }),
    onSuccess: async () => {
      setNombre('');
      setDocumento('');
      setNota('');
      notificar('Agregado a la lista restrictiva.');
      await refrescar();
    },
  });
  const cambiar = useMutation({
    mutationFn: (entrada: EntradaLista) => cambiarEntrada(entrada.id, !entrada.activa),
    onSuccess: refrescar,
  });
  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    agregar.mutate();
  };
  const entradas = lista.data?.entradas ?? [];

  return (
    <>
      <p className="campo__ayuda">
        Si el remitente o el beneficiario de una remesa coincide por documento o por nombre, la
        remesa se bloquea y queda una alerta escalada.
      </p>
      <form className="formulario-ancho" onSubmit={enviar} noValidate>
        <CampoSelector
          etiqueta="Fuente"
          value={fuente}
          onChange={(evento) => setFuente(evento.target.value as EntradaLista['fuente'])}
        >
          <option value="propia">Propia</option>
          <option value="onu">ONU</option>
          <option value="ofac">OFAC</option>
        </CampoSelector>
        <Campo
          etiqueta="Nombre como aparece en la lista"
          maxLength={150}
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
        />
        <Campo
          etiqueta="Documento (opcional)"
          maxLength={20}
          value={documento}
          onChange={(evento) => setDocumento(evento.target.value)}
        />
        <Campo
          etiqueta="Nota (opcional)"
          maxLength={300}
          value={nota}
          onChange={(evento) => setNota(evento.target.value)}
        />
        {agregar.isError && <Aviso tipo="error">{mensajeDe(agregar.error)}</Aviso>}
        <div className="acciones">
          <Boton type="submit" cargando={agregar.isPending} disabled={nombre.trim().length < 3}>
            Agregar a la lista
          </Boton>
        </div>
      </form>
      {lista.isPending && <Esqueleto texto="Cargando la lista…" />}
      {entradas.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">Lista restrictiva</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Documento</th>
                <th scope="col">Fuente</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entradas.map((e) => (
                <tr key={e.id}>
                  <td>
                    {e.nombre}
                    {e.nota && <small>{e.nota}</small>}
                  </td>
                  <td className="mono">{e.numeroDocumento ?? '—'}</td>
                  <td>{ETIQUETAS_FUENTE[e.fuente]}</td>
                  <td>{e.activa ? 'Activa' : 'Desactivada'}</td>
                  <td>
                    <Boton variante="secundario" chico onClick={() => cambiar.mutate(e)}>
                      {e.activa ? 'Desactivar' : 'Reactivar'}
                    </Boton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const textoONulo = (texto: string) => (texto.trim() === '' ? null : texto.trim());
const enteroONulo = (texto: string) => (texto.trim() === '' ? null : Number.parseInt(texto, 10));

function FormularioParametros() {
  const parametros = useParametros(true);
  if (parametros.isPending) return <Esqueleto texto="Cargando los parámetros…" />;
  if (parametros.isError) return <Aviso tipo="error">{mensajeDe(parametros.error)}</Aviso>;
  return <EditorParametros inicial={parametros.data.parametros} />;
}

function EditorParametros({ inicial }: { inicial: Parametros }) {
  const notificar = useNotificar();
  const consultas = useQueryClient();
  const [umbral, setUmbral] = useState(inicial.umbralFichaMensual ?? '');
  const [cantidad, setCantidad] = useState(inicial.fraccionamientoCantidad?.toString() ?? '');
  const [montoMaximo, setMontoMaximo] = useState(inicial.fraccionamientoMontoMaximo ?? '');
  const [remitentes, setRemitentes] = useState(inicial.concentracionRemitentes?.toString() ?? '');
  const guardar = useMutation({
    mutationFn: () =>
      guardarParametros({
        umbralFichaMensual: textoONulo(umbral),
        fraccionamientoCantidad: enteroONulo(cantidad),
        fraccionamientoMontoMaximo: textoONulo(montoMaximo),
        concentracionRemitentes: enteroONulo(remitentes),
      }),
    onSuccess: async () => {
      notificar('Parámetros guardados.');
      await consultas.invalidateQueries({ queryKey: CLAVE_CUMPLIMIENTO });
    },
  });
  const delServidor = erroresPorCampo(guardar.error);
  const enviar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    guardar.mutate();
  };
  return (
    <form className="formulario-ancho" onSubmit={enviar} noValidate>
      <Aviso tipo="advertencia">
        Valores de ejemplo, no normativos: defínelos con el contador. Un campo vacío apaga la regla.
      </Aviso>
      <Campo
        etiqueta="Monto mensual (COP) que exige la ficha ampliada"
        inputMode="decimal"
        value={umbral}
        onChange={(evento) => setUmbral(evento.target.value)}
        error={delServidor.umbralFichaMensual}
      />
      <Campo
        etiqueta="Fraccionamiento: más de N remesas en 24 horas"
        inputMode="numeric"
        value={cantidad}
        onChange={(evento) => setCantidad(evento.target.value.replace(/\D/g, ''))}
        error={delServidor.fraccionamientoCantidad}
      />
      <Campo
        etiqueta="Fraccionamiento: cada una por debajo de (COP)"
        inputMode="decimal"
        value={montoMaximo}
        onChange={(evento) => setMontoMaximo(evento.target.value)}
        error={delServidor.fraccionamientoMontoMaximo}
      />
      <Campo
        etiqueta="Concentración: beneficiario con más de M remitentes en 30 días"
        inputMode="numeric"
        value={remitentes}
        onChange={(evento) => setRemitentes(evento.target.value.replace(/\D/g, ''))}
        error={delServidor.concentracionRemitentes}
      />
      {guardar.isError && Object.keys(delServidor).length === 0 && (
        <Aviso tipo="error">{mensajeDe(guardar.error)}</Aviso>
      )}
      <div className="acciones">
        <Boton type="submit" cargando={guardar.isPending}>
          Guardar parámetros
        </Boton>
      </div>
    </form>
  );
}

function Exporte() {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const url = urlApi(`/cumplimiento/exportes/operaciones?desde=${desde}&hasta=${hasta}`);
  return (
    <div className="formulario-ancho">
      <p className="campo__ayuda">
        Archivo CSV con las remesas y las operaciones de divisas del periodo, con documento, nombre,
        montos y tasa. El formato oficial de la UIAF se ajusta cuando el contador lo defina.
      </p>
      <Campo
        etiqueta="Desde"
        type="date"
        value={desde}
        onChange={(e) => setDesde(e.target.value)}
      />
      <Campo
        etiqueta="Hasta"
        type="date"
        value={hasta}
        onChange={(e) => setHasta(e.target.value)}
      />
      <div className="acciones">
        <a className="boton" href={url} download>
          Descargar CSV
        </a>
      </div>
    </div>
  );
}
