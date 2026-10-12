import { Boton } from '../../componentes/Boton.js';
import { MenuAcciones, type AccionMenu } from '../../componentes/MenuAcciones.js';
import { ETIQUETAS_ROL, formatearFechaHora } from '../../lib/formato.js';
import type { UsuarioLista } from '../../modulos/usuarios/tipos.js';

export type AccionUsuario =
  'editar' | 'desactivar' | 'reactivar' | 'restablecer' | 'reiniciar2fa' | 'cerrarSesiones';

interface PropiedadesTabla {
  usuarios: UsuarioLista[];
  /** Id de quien está usando el sistema: no puede desactivarse a sí mismo. */
  usuarioActualId: string;
  zonaHoraria: string;
  alElegir: (accion: AccionUsuario, usuario: UsuarioLista) => void;
}

function Etiquetas({ usuario, zonaHoraria }: { usuario: UsuarioLista; zonaHoraria: string }) {
  const bloqueado =
    usuario.bloqueadoHasta !== null && new Date(usuario.bloqueadoHasta).getTime() > Date.now();
  return (
    <div className="etiquetas">
      {usuario.activo ? (
        <span className="etiqueta etiqueta--exito">Activo</span>
      ) : (
        <span className="etiqueta">Inactivo</span>
      )}
      {!usuario.tiene2fa && (
        <span className="etiqueta etiqueta--alerta">Sin verificación en dos pasos</span>
      )}
      {usuario.debeCambiarContrasena && (
        <span className="etiqueta etiqueta--alerta">Contraseña temporal</span>
      )}
      {bloqueado && usuario.bloqueadoHasta && (
        <span className="etiqueta etiqueta--error">
          Bloqueado hasta {formatearFechaHora(usuario.bloqueadoHasta, zonaHoraria)}
        </span>
      )}
    </div>
  );
}

/** Acciones de acceso de una persona. Nadie puede desactivarse a sí mismo (el servidor también lo impide). */
function accionesDe(
  usuario: UsuarioLista,
  esElMismo: boolean,
  alElegir: PropiedadesTabla['alElegir'],
): AccionMenu[] {
  const elegir = (accion: AccionUsuario) => () => {
    alElegir(accion, usuario);
  };
  const acciones: AccionMenu[] = [
    { etiqueta: 'Restablecer contraseña', alElegir: elegir('restablecer') },
    { etiqueta: 'Reiniciar verificación en dos pasos', alElegir: elegir('reiniciar2fa') },
    { etiqueta: 'Cerrar sus sesiones', alElegir: elegir('cerrarSesiones') },
  ];
  if (!usuario.activo) acciones.push({ etiqueta: 'Reactivar', alElegir: elegir('reactivar') });
  else if (!esElMismo) {
    acciones.push({ etiqueta: 'Desactivar', alElegir: elegir('desactivar'), peligro: true });
  }
  return acciones;
}

export function TablaUsuarios({
  usuarios,
  usuarioActualId,
  zonaHoraria,
  alElegir,
}: PropiedadesTabla) {
  return (
    <div className="tabla-contenedor">
      <table className="tabla">
        <caption className="solo-lectores">Usuarios del sistema</caption>
        <thead>
          <tr>
            <th scope="col">Usuario</th>
            <th scope="col">Rol</th>
            <th scope="col">Sucursal</th>
            <th scope="col">Último acceso</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((usuario) => {
            const esElMismo = usuario.id === usuarioActualId;
            return (
              <tr key={usuario.id}>
                <td>
                  <strong>{usuario.nombre}</strong>
                  {esElMismo && ' (tú)'}
                  <small>{usuario.login}</small>
                  <Etiquetas usuario={usuario} zonaHoraria={zonaHoraria} />
                </td>
                <td>{ETIQUETAS_ROL[usuario.rol]}</td>
                <td>{usuario.sucursalNombre ?? '—'}</td>
                <td>
                  {usuario.ultimoAcceso
                    ? formatearFechaHora(usuario.ultimoAcceso, zonaHoraria)
                    : 'Nunca'}
                </td>
                <td>
                  <div className="tabla__acciones">
                    <Boton
                      variante="secundario"
                      chico
                      aria-label={`Editar a ${usuario.nombre}`}
                      onClick={() => alElegir('editar', usuario)}
                    >
                      Editar
                    </Boton>
                    <MenuAcciones
                      etiqueta={`Más acciones de ${usuario.nombre}`}
                      acciones={accionesDe(usuario, esElMismo, alElegir)}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
