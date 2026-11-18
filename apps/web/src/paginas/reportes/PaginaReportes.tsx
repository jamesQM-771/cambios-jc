import { formatearMoneda, type Moneda } from '@cambios-jc/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type ChangeEvent, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoAreaTexto } from '../../componentes/CampoAreaTexto.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import { EncabezadoPagina, EstadoVacio, Esqueleto } from '../../componentes/Pagina.js';
import { mensajeDe } from '../../lib/api.js';
import { formatearFechaHora, formatearTasa } from '../../lib/formato.js';
import { useTitulo } from '../../lib/titulo.js';
import { useSesionActual } from '../../modulos/auth/ContextoSesion.js';
import {
  buscarOperaciones,
  migrarSaldos,
  obtenerReporte,
  obtenerTablero,
  urlReporteCsv,
  URL_EXPORTACION,
  type FiltroBusqueda,
  type NombreReporte,
  type ResultadoMigracion,
} from '../../modulos/reportes/api.js';

type Seccion = 'tablero' | 'reportes' | 'historico' | 'datos';

const NOMBRES: [NombreReporte, string][] = [
  ['ganancia', 'Ganancia neta por día'],
  ['top_clientes', 'Clientes que más envían'],
  ['proveedores', 'Volumen por proveedor'],
  ['arqueo', 'Diferencias de arqueo por vendedor'],
  ['tasas_manuales', 'Uso de tasas manuales'],
  ['costos_bancarios', 'Costos bancarios'],
];

const dinero = (valor: string, moneda: string) => formatearMoneda(valor, moneda as Moneda);
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

/** Reportes, histórico, tablero del dueño y datos del negocio (§5.17, §9.8). */
export function PaginaReportes() {
  useTitulo('Reportes');
  const { permisos } = useSesionActual();
  const [seccion, setSeccion] = useState<Seccion>('tablero');
  const secciones: [Seccion, string][] = [
    ['tablero', 'Tablero'],
    ['reportes', 'Reportes'],
    ['historico', 'Histórico'],
    ...(permisos.includes('datos.exportar') ? ([['datos', 'Datos']] as [Seccion, string][]) : []),
  ];
  return (
    <>
      <EncabezadoPagina
        titulo="Reportes"
        descripcion="Ganancia, liquidez, deudas y el histórico de operaciones. Todo se descarga en CSV (abre en Excel) o se imprime."
      />
      <div className="acciones" role="tablist" aria-label="Secciones de reportes">
        {secciones.map(([valor, etiqueta]) => (
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
      {seccion === 'tablero' && <SeccionTablero />}
      {seccion === 'reportes' && <SeccionReportes />}
      {seccion === 'historico' && <SeccionHistorico />}
      {seccion === 'datos' && <SeccionDatos />}
    </>
  );
}

function SeccionTablero() {
  const tablero = useQuery({ queryKey: ['reportes', 'tablero'], queryFn: obtenerTablero });
  if (tablero.isPending) return <Esqueleto texto="Cargando el tablero…" />;
  if (tablero.isError) return <Aviso tipo="error">{mensajeDe(tablero.error)}</Aviso>;
  const t = tablero.data.tablero;
  return (
    <div className="tarjetas-resumen">
      <div className="tarjeta" aria-label="Ganancia">
        <p>
          <strong>Ganancia de hoy:</strong>{' '}
          <span className="mono">{dinero(t.gananciaHoy, t.moneda)}</span>
        </p>
        <p>
          <strong>Ganancia del mes:</strong>{' '}
          <span className="mono">{dinero(t.gananciaMes, t.moneda)}</span>
        </p>
        <p>
          <strong>Remesas de hoy:</strong> {t.remesasHoy}
        </p>
      </div>
      {t.liquidez.map((l) => (
        <div key={l.moneda} className="tarjeta" aria-label={`Liquidez en ${l.moneda}`}>
          <p>
            <strong>Disponible:</strong>{' '}
            <span className="mono">{dinero(l.disponible, l.moneda)}</span>
          </p>
          <p>
            <strong>En cola por pagar:</strong>{' '}
            <span className="mono">{dinero(l.comprometido, l.moneda)}</span>
          </p>
          <p>
            <strong>Libre:</strong> <span className="mono">{dinero(l.libre, l.moneda)}</span>
          </p>
        </div>
      ))}
      <div className="tarjeta" aria-label="Deudas y alertas">
        {t.contrapartes.map((c) => (
          <p key={c.moneda}>
            <strong>{c.moneda}:</strong> me deben{' '}
            <span className="mono">{dinero(c.meDeben, c.moneda)}</span> · les debo{' '}
            <span className="mono">{dinero(c.lesDebo, c.moneda)}</span>
          </p>
        ))}
        <p>
          <strong>Alertas de cumplimiento abiertas:</strong> {t.alertasAbiertas}
        </p>
      </div>
    </div>
  );
}

function SeccionReportes() {
  const [nombre, setNombre] = useState<NombreReporte>('ganancia');
  const [desde, setDesde] = useState(hoy().slice(0, 8) + '01');
  const [hasta, setHasta] = useState(hoy());
  const reporte = useQuery({
    queryKey: ['reportes', nombre, desde, hasta],
    queryFn: () => obtenerReporte(nombre, desde, hasta),
    enabled: desde !== '' && hasta !== '' && desde <= hasta,
  });
  return (
    <>
      <div className="barra-herramientas">
        <CampoSelector
          etiqueta="Reporte"
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value as NombreReporte)}
        >
          {NOMBRES.map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </CampoSelector>
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
      </div>
      <div className="acciones">
        <a className="boton boton--secundario" href={urlReporteCsv(nombre, desde, hasta)} download>
          Descargar CSV
        </a>
        <Boton variante="secundario" onClick={() => window.print()}>
          Imprimir
        </Boton>
      </div>
      {desde > hasta && <Aviso tipo="advertencia">La fecha inicial va antes de la final.</Aviso>}
      {reporte.isPending && reporte.fetchStatus !== 'idle' && <Esqueleto texto="Calculando…" />}
      {reporte.isError && <Aviso tipo="error">{mensajeDe(reporte.error)}</Aviso>}
      {reporte.data && reporte.data.reporte.filas.length === 0 && (
        <EstadoVacio titulo="No hay datos en ese periodo" icono="info" />
      )}
      {reporte.data && reporte.data.reporte.filas.length > 0 && (
        <div className="tabla-contenedor imprimible">
          <table className="tabla">
            <caption>
              {reporte.data.reporte.titulo} · {desde} a {hasta}
            </caption>
            <thead>
              <tr>
                {reporte.data.reporte.columnas.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reporte.data.reporte.filas.map((fila, i) => (
                <tr key={i}>
                  {fila.map((celda, j) => (
                    <td key={j} className="mono">
                      {celda}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SeccionHistorico() {
  const { empresa } = useSesionActual();
  const zona = empresa?.zonaHoraria ?? 'America/Bogota';
  const [borrador, setBorrador] = useState<FiltroBusqueda>({
    pagina: 1,
    comparacion: 'igual',
    fecha: hoy(),
  });
  const [filtro, setFiltro] = useState<FiltroBusqueda>(borrador);
  const resultados = useQuery({
    queryKey: ['reportes', 'buscar', filtro],
    queryFn: () => buscarOperaciones(filtro),
  });
  const cambiar =
    (campo: keyof FiltroBusqueda) => (evento: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setBorrador((actual) => ({
        ...actual,
        [campo]: evento.target.value === '' ? undefined : evento.target.value,
      }));
  const buscar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    setFiltro({ ...borrador, pagina: 1 });
  };
  const lista = resultados.data?.resultados ?? [];
  return (
    <>
      <form className="barra-herramientas" onSubmit={buscar} noValidate>
        <Campo
          etiqueta="Documento o nombre"
          value={borrador.texto ?? ''}
          onChange={cambiar('texto')}
        />
        <Campo
          etiqueta="Comprobante"
          inputMode="numeric"
          value={borrador.comprobante ?? ''}
          onChange={cambiar('comprobante')}
        />
        <CampoSelector etiqueta="Tipo" value={borrador.tipo ?? ''} onChange={cambiar('tipo')}>
          <option value="">Todos</option>
          <option value="remesa">Remesas</option>
          <option value="divisa">Divisas</option>
        </CampoSelector>
        <CampoSelector
          etiqueta="Fecha"
          value={borrador.comparacion ?? ''}
          onChange={cambiar('comparacion')}
        >
          <option value="">Cualquiera</option>
          <option value="igual">Igual a</option>
          <option value="mayor">Desde</option>
          <option value="menor">Hasta</option>
          <option value="entre">Entre</option>
        </CampoSelector>
        {borrador.comparacion && (
          <Campo
            etiqueta="Día"
            type="date"
            value={borrador.fecha ?? ''}
            onChange={cambiar('fecha')}
          />
        )}
        {borrador.comparacion === 'entre' && (
          <Campo
            etiqueta="Hasta el día"
            type="date"
            value={borrador.fechaHasta ?? ''}
            onChange={cambiar('fechaHasta')}
          />
        )}
        <Boton type="submit">Buscar</Boton>
      </form>
      {resultados.isPending && <Esqueleto texto="Buscando…" />}
      {resultados.isError && <Aviso tipo="error">{mensajeDe(resultados.error)}</Aviso>}
      {resultados.data && lista.length === 0 && (
        <EstadoVacio titulo="Sin resultados" icono="buscar" />
      )}
      {lista.length > 0 && (
        <div className="tabla-contenedor imprimible">
          <table className="tabla">
            <caption className="solo-lectores">Resultados de la búsqueda</caption>
            <thead>
              <tr>
                <th scope="col">N°</th>
                <th scope="col">Fecha</th>
                <th scope="col">Tipo</th>
                <th scope="col">Cliente</th>
                <th scope="col">Estado</th>
                <th scope="col" className="tabla__numero">
                  Pesos
                </th>
                <th scope="col" className="tabla__numero">
                  Extranjera
                </th>
                <th scope="col" className="tabla__numero">
                  Tasa
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={`${r.tipo}-${r.id}`}>
                  <td className="mono">{r.numeroComprobante}</td>
                  <td>
                    {formatearFechaHora(r.fecha, zona)}
                    <small>{r.usuario}</small>
                  </td>
                  <td>{r.tipo === 'remesa' ? 'Remesa' : 'Divisa'}</td>
                  <td>
                    {r.cliente}
                    {r.beneficiario && <small>Para {r.beneficiario}</small>}
                  </td>
                  <td>{r.estado.replaceAll('_', ' ')}</td>
                  <td className="tabla__numero mono">{dinero(r.montoLocal, 'COP')}</td>
                  <td className="tabla__numero mono">
                    {dinero(r.montoExtranjero, r.monedaExtranjera)}
                  </td>
                  <td className="tabla__numero mono">{formatearTasa(r.tasa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="acciones">
        {filtro.pagina > 1 && (
          <Boton
            variante="secundario"
            onClick={() => setFiltro({ ...filtro, pagina: filtro.pagina - 1 })}
          >
            Anterior
          </Boton>
        )}
        {resultados.data?.hayMas && (
          <Boton
            variante="secundario"
            onClick={() => setFiltro({ ...filtro, pagina: filtro.pagina + 1 })}
          >
            Siguiente
          </Boton>
        )}
      </div>
    </>
  );
}

function SeccionDatos() {
  const notificar = useNotificar();
  const { permisos } = useSesionActual();
  const [csv, setCsv] = useState('');
  const [resultado, setResultado] = useState<ResultadoMigracion | null>(null);
  const migrar = useMutation({
    mutationFn: (aplicar: boolean) => migrarSaldos(csv, aplicar),
    onSuccess: (datos, aplicar) => {
      setResultado(datos);
      if (aplicar)
        notificar(
          `Saldos cargados: ${String(datos.aplicadas)} nuevos, ${String(datos.yaCargadas)} ya estaban.`,
        );
    },
  });
  const leerArchivo = (evento: ChangeEvent<HTMLInputElement>) => {
    const archivo = evento.target.files?.[0];
    if (archivo) void archivo.text().then(setCsv);
  };
  return (
    <>
      <h2>Exportación completa</h2>
      <p className="campo__ayuda">
        Descarga todos los datos del negocio (clientes, cuentas, operaciones, contrapartes, caja y
        cumplimiento) en un archivo JSON, sin depender de nadie. No incluye contraseñas ni las
        imágenes de los comprobantes.
      </p>
      <div className="acciones">
        <a className="boton" href={URL_EXPORTACION} download>
          Descargar todos los datos
        </a>
      </div>

      {permisos.includes('migracion.cargar') && (
        <>
          <h2>Saldos iniciales de contrapartes (desde el Excel)</h2>
          <p className="campo__ayuda">
            Exporta del Excel un CSV con las columnas nombre, moneda y saldo. En el Excel un saldo
            negativo es que la persona te debe: aquí se invierte el signo. Revisa la vista previa
            antes de aplicar; cargar dos veces no duplica.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Archivo CSV"
            onChange={leerArchivo}
          />
          <CampoAreaTexto
            etiqueta="Contenido del CSV"
            rows={5}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          <div className="acciones">
            <Boton
              variante="secundario"
              disabled={csv.trim() === ''}
              cargando={migrar.isPending && !migrar.variables}
              onClick={() => migrar.mutate(false)}
            >
              Ver vista previa
            </Boton>
            <Boton
              disabled={!resultado || resultado.errores.length > 0 || resultado.filas.length === 0}
              cargando={migrar.isPending && migrar.variables}
              onClick={() => migrar.mutate(true)}
            >
              Aplicar la carga
            </Boton>
          </div>
          {migrar.isError && <Aviso tipo="error">{mensajeDe(migrar.error)}</Aviso>}
          {resultado && resultado.errores.length > 0 && (
            <Aviso tipo="error">
              {resultado.errores.map((e) => `Línea ${String(e.linea)}: ${e.mensaje}`).join(' · ')}
            </Aviso>
          )}
          {resultado && resultado.filas.length > 0 && (
            <div className="tabla-contenedor">
              <table className="tabla">
                <caption className="solo-lectores">Vista previa de la carga</caption>
                <thead>
                  <tr>
                    <th scope="col">Contraparte</th>
                    <th scope="col">En el Excel</th>
                    <th scope="col">En el sistema</th>
                    <th scope="col">¿Existe?</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.filas.map((f) => (
                    <tr key={f.linea}>
                      <td>{f.nombre}</td>
                      <td className="mono">
                        {dinero(f.saldoExcel.replace('-', ''), f.moneda)}
                        {f.saldoExcel.startsWith('-') ? ' (negativo)' : ''}
                      </td>
                      <td>
                        {f.etiqueta === 'me_debe' ? 'Me debe' : 'Le debo'}{' '}
                        <span className="mono">
                          {dinero(f.saldoSistema.replace('-', ''), f.moneda)}
                        </span>
                      </td>
                      <td>{f.contraparteExiste ? 'Sí' : 'Se crea'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
