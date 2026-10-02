import { useRef } from 'react';

import { Boton } from '../../componentes/Boton.js';
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
        <span className="etiqueta etiqueta--error">Inactivo</span>
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

/** Menú de acciones de una fila con el elemento nativo `<details>`: se maneja con teclado y no necesita JavaScript. */
function MasAcciones({
  usuario,
  esElMismo,
  alElegir,
}: {
  usuario: UsuarioLista;
  esElMismo: boolean;
  alElegir: PropiedadesTabla['alElegir'];
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const elegir = (accion: AccionUsuario) => {
    if (menu.current) menu.current.open = false;
    alElegir(accion, usuario);
  };
  return (
    <details className="mas-acciones" ref={menu}>
      <summary className="boton boton--secundario boton--chico">Más acciones</summary>
      <div className="mas-acciones__lista">
        {usuario.activo ? (
          // Nadie puede desactivarse a sí mismo (el servidor también lo impide).
          !esElMismo && (
            <Boton variante="peligro" chico onClick={() => elegir('desactivar')}>
              Desactivar
            </Boton>
          )
        ) : (
          <Boton variante="secundario" chico onClick={() => elegir('reactivar')}>
            Reactivar
          </Boton>
        )}
        <Boton variante="secundario" chico onClick={() => elegir('restablecer')}>
          Restablecer contraseña
        </Boton>
        <Boton variante="secundario" chico onClick={() => elegir('reiniciar2fa')}>
          Reiniciar verificación en dos pasos
        </Boton>
        <Boton variante="secundario" chico onClick={() => elegir('cerrarSesiones')}>
          Cerrar sus sesiones
        </Boton>
      </div>
    </details>
  );
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
                    <MasAcciones usuario={usuario} esElMismo={esElMismo} alElegir={alElegir} />
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
