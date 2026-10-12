import { Boton } from '../../componentes/Boton.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { formatearFechaHora } from '../../lib/formato.js';
import type { RegistroAuditoria } from '../../modulos/auditoria/api.js';
import { cambiosDe, describirAccion, etiquetaEntidad } from '../../modulos/auditoria/lenguaje.js';

interface PropiedadesDetalle {
  registro: RegistroAuditoria | null;
  zonaHoraria: string;
  alCerrar: () => void;
}

const comoTexto = (valor: unknown): string =>
  valor === null || valor === undefined ? 'Sin datos' : JSON.stringify(valor, null, 2);

/** Todo lo que se sabe de un registro de la bitácora, con el antes y el después lado a lado. */
export function DetalleRegistro({ registro, zonaHoraria, alCerrar }: PropiedadesDetalle) {
  const cambios = registro ? cambiosDe(registro.antes, registro.despues) : [];
  return (
    <Dialogo abierto={registro !== null} alCerrar={alCerrar} titulo="Detalle del registro" ancho>
      {registro && (
        <>
          <dl className="datos-registro">
            <dt>Fecha</dt>
            <dd>{formatearFechaHora(registro.fecha, zonaHoraria)}</dd>
            <dt>Usuario</dt>
            <dd>
              {registro.usuario
                ? `${registro.usuario.nombre} (${registro.usuario.login})`
                : 'Sin usuario (acción del sistema o intento sin sesión)'}
            </dd>
            <dt>Qué pasó</dt>
            <dd>
              {describirAccion(registro.accion)}
              {describirAccion(registro.accion) !== registro.accion && (
                <>
                  {' '}
                  <code>({registro.accion})</code>
                </>
              )}
            </dd>
            <dt>Sobre qué</dt>
            <dd>
              {etiquetaEntidad(registro.entidad)}
              {registro.entidadId ? ` · id ${registro.entidadId}` : ''}
            </dd>
            <dt>Dirección IP</dt>
            <dd>{registro.ip ?? '—'}</dd>
            <dt>Dispositivo</dt>
            <dd>{registro.agenteUsuario ?? '—'}</dd>
          </dl>
          {cambios.length > 0 && (
            <>
              <h3>Qué cambió</h3>
              <div className="tabla-contenedor tabla-contenedor--cambios">
                <table className="tabla">
                  <caption className="solo-lectores">Campos que cambiaron</caption>
                  <thead>
                    <tr>
                      <th scope="col">Dato</th>
                      <th scope="col">Antes</th>
                      <th scope="col">Después</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cambios.map((cambio) => (
                      <tr key={cambio.campo}>
                        <th scope="row">{cambio.campo}</th>
                        <td>{cambio.antes}</td>
                        <td>{cambio.despues}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="campo__ayuda">Datos técnicos del registro, tal como quedaron guardados:</p>
          <div className="comparacion">
            <section aria-labelledby="titulo-antes">
              <h3 id="titulo-antes">Antes</h3>
              <pre>{comoTexto(registro.antes)}</pre>
            </section>
            <section aria-labelledby="titulo-despues">
              <h3 id="titulo-despues">Después</h3>
              <pre>{comoTexto(registro.despues)}</pre>
            </section>
          </div>
          <div className="acciones acciones--derecha">
            <Boton onClick={alCerrar}>Cerrar</Boton>
          </div>
        </>
      )}
    </Dialogo>
  );
}
