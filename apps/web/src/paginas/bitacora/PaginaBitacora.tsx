import { useQuery } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Campo } from '../../componentes/Campo.js';
import { CampoSelector } from '../../componentes/CampoSelector.js';
import { EncabezadoPagina, EstadoVacio, Esqueleto } from '../../componentes/Pagina.js';
import { Paginacion } from '../../componentes/Paginacion.js';
import { mensajeDe } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/formato.js';
import { useTitulo } from '../../lib/titulo.js';
import {
  useAuditoria,
  type FiltrosAuditoria,
  type RegistroAuditoria,
} from '../../modulos/auditoria/api.js';
import {
  describirAccion,
  ETIQUETAS_ENTIDAD,
  FRASES_ACCION,
} from '../../modulos/auditoria/lenguaje.js';
import { useSesionActual } from '../../modulos/auth/ContextoSesion.js';
import { listarUsuarios } from '../../modulos/usuarios/api.js';

import { DetalleRegistro } from './DetalleRegistro.js';

const POR_PAGINA = 50;

const FILTROS_VACIOS: FiltrosAuditoria = {
  desde: '',
  hasta: '',
  usuarioId: '',
  accion: '',
  entidad: '',
  pagina: 1,
  porPagina: POR_PAGINA,
};

export function PaginaBitacora() {
  useTitulo('Actividad');
  const { empresa } = useSesionActual();
  const zonaHoraria = empresa?.zonaHoraria ?? 'America/Bogota';

  // `borrador` es lo que se está escribiendo; `aplicados` es lo que se consulta (al pulsar "Filtrar").
  const [borrador, setBorrador] = useState(FILTROS_VACIOS);
  const [aplicados, setAplicados] = useState(FILTROS_VACIOS);
  const [errorFechas, setErrorFechas] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<RegistroAuditoria | null>(null);

  const consulta = useAuditoria(aplicados);
  // Para elegir usuario en el filtro se traen hasta 100 (es un negocio pequeño).
  const usuarios = useQuery({
    queryKey: ['usuarios', 'para-filtro'],
    queryFn: () => listarUsuarios({ busqueda: '', rol: '', activo: '', pagina: 1, porPagina: 100 }),
    staleTime: 60_000,
  });

  const cambiar = (campo: keyof FiltrosAuditoria) => (valor: string) =>
    setBorrador((anterior) => ({ ...anterior, [campo]: valor }));

  const filtrar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (borrador.desde && borrador.hasta && borrador.desde > borrador.hasta) {
      setErrorFechas('La fecha "Desde" no puede ser posterior a "Hasta".');
      return;
    }
    setErrorFechas(null);
    setAplicados({
      ...borrador,
      accion: borrador.accion.trim(),
      entidad: borrador.entidad.trim(),
      pagina: 1,
    });
  };

  const limpiar = () => {
    setBorrador(FILTROS_VACIOS);
    setAplicados(FILTROS_VACIOS);
    setErrorFechas(null);
  };

  return (
    <>
      <EncabezadoPagina
        titulo="Actividad"
        descripcion={
          <>
            Quién hizo qué y cuándo. Estos registros no se pueden modificar ni borrar. Las fechas se
            muestran en la zona horaria de la empresa ({zonaHoraria}).
          </>
        }
      />

      <form className="filtros" onSubmit={filtrar} noValidate>
        <Campo
          etiqueta="Desde"
          type="date"
          value={borrador.desde}
          onChange={(evento) => cambiar('desde')(evento.target.value)}
          error={errorFechas ?? undefined}
        />
        <Campo
          etiqueta="Hasta"
          type="date"
          value={borrador.hasta}
          onChange={(evento) => cambiar('hasta')(evento.target.value)}
        />
        <CampoSelector
          etiqueta="Usuario"
          value={borrador.usuarioId}
          onChange={(evento) => cambiar('usuarioId')(evento.target.value)}
        >
          <option value="">Todos</option>
          {usuarios.data?.usuarios.map((usuario) => (
            <option key={usuario.id} value={usuario.id}>
              {usuario.nombre} ({usuario.login})
            </option>
          ))}
        </CampoSelector>
        <CampoSelector
          etiqueta="Acción"
          value={borrador.accion}
          onChange={(evento) => cambiar('accion')(evento.target.value)}
        >
          <option value="">Todas</option>
          {Object.entries(FRASES_ACCION).map(([codigo, frase]) => (
            <option key={codigo} value={codigo}>
              {frase.charAt(0).toUpperCase() + frase.slice(1)}
            </option>
          ))}
        </CampoSelector>
        <CampoSelector
          etiqueta="Sobre qué"
          value={borrador.entidad}
          onChange={(evento) => cambiar('entidad')(evento.target.value)}
        >
          <option value="">Todo</option>
          {Object.entries(ETIQUETAS_ENTIDAD).map(([codigo, etiqueta]) => (
            <option key={codigo} value={codigo}>
              {etiqueta}
            </option>
          ))}
        </CampoSelector>
        <div className="filtros__acciones">
          <Boton type="submit">Filtrar</Boton>
          <Boton variante="secundario" onClick={limpiar}>
            Limpiar
          </Boton>
        </div>
      </form>

      {consulta.isPending && <Esqueleto texto="Cargando la actividad…" filas={8} />}
      {consulta.isError && <Aviso tipo="error">{mensajeDe(consulta.error)}</Aviso>}
      {consulta.data &&
        (consulta.data.registros.length === 0 ? (
          <div className="tabla-contenedor">
            <EstadoVacio
              icono="buscar"
              titulo="No hay registros con esos filtros."
              descripcion="Prueba con otras fechas o quita algún filtro."
            />
          </div>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla">
                <caption className="solo-lectores">Registros de actividad</caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Quién</th>
                    <th scope="col">Qué pasó</th>
                    <th scope="col">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {consulta.data.registros.map((registro) => (
                    <tr key={registro.id}>
                      <td>{formatearFechaHora(registro.fecha, zonaHoraria)}</td>
                      <td>
                        {registro.usuario ? (
                          <>
                            {registro.usuario.nombre}
                            <small>{registro.usuario.login}</small>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {describirAccion(registro.accion)}
                        {/* Sin traducción ya se está mostrando el código: no se repite. */}
                        {describirAccion(registro.accion) !== registro.accion && (
                          <small>
                            <code>{registro.accion}</code>
                          </small>
                        )}
                      </td>
                      <td>
                        <Boton
                          variante="secundario"
                          chico
                          aria-label={`Ver detalle de ${registro.accion}`}
                          onClick={() => setDetalle(registro)}
                        >
                          Ver detalle
                        </Boton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion
              pagina={consulta.data.pagina}
              porPagina={consulta.data.porPagina}
              total={consulta.data.total}
              alCambiar={(pagina) => setAplicados((anterior) => ({ ...anterior, pagina }))}
            />
          </>
        ))}

      <DetalleRegistro
        registro={detalle}
        zonaHoraria={zonaHoraria}
        alCerrar={() => setDetalle(null)}
      />
    </>
  );
}
