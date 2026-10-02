import { Boton } from '../../componentes/Boton.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { formatearFechaHora } from '../../lib/formato.js';
import type { RegistroAuditoria } from '../../modulos/auditoria/api.js';

interface PropiedadesDetalle {
  registro: RegistroAuditoria | null;
  zonaHoraria: string;
  alCerrar: () => void;
}

const comoTexto = (valor: unknown): string =>
  valor === null || valor === undefined ? 'Sin datos' : JSON.stringify(valor, null, 2);

/** Todo lo que se sabe de un registro de la bitácora, con el antes y el después lado a lado. */
export function DetalleRegistro({ registro, zonaHoraria, alCerrar }: PropiedadesDetalle) {
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
            <dt>Acción</dt>
            <dd>
              <code>{registro.accion}</code>
            </dd>
            <dt>Entidad</dt>
            <dd>
              <code>{registro.entidad}</code>
            </dd>
            <dt>Id de la entidad</dt>
            <dd>{registro.entidadId ?? '—'}</dd>
            <dt>Dirección IP</dt>
            <dd>{registro.ip ?? '—'}</dd>
            <dt>Dispositivo</dt>
            <dd>{registro.agenteUsuario ?? '—'}</dd>
          </dl>
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
