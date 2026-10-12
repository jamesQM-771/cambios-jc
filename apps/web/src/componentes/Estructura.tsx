import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';

import { useSesionActual } from '../modulos/auth/ContextoSesion.js';
import { guardarMenuContraido, menuContraidoGuardado } from '../lib/menu-lateral.js';
import { entradasVisibles, GRUPOS_MENU } from '../modulos/navegacion/menu.js';

import { Encabezado } from './Encabezado.js';
import { Icono } from './Icono.js';
import { ProveedorNotificaciones } from './Notificaciones.js';

/**
 * Estructura de las pantallas con sesión: encabezado, menú lateral y contenido. Si la persona solo
 * tiene acceso a "Inicio" (por ejemplo, el digitador) no se muestra menú: queda una estructura mínima,
 * pensada para celular.
 */
export function Estructura() {
  const { permisos } = useSesionActual();
  const [menuAbierto, setMenuAbierto] = useState(false);
  // Contraído solo cuenta en pantallas anchas; en celular el menú es un cajón y siempre va completo.
  const [menuContraido, setMenuContraido] = useState(menuContraidoGuardado);
  const entradas = entradasVisibles(permisos);
  const conMenu = entradas.length > 1;

  const alternarContraido = () => {
    const nuevo = !menuContraido;
    setMenuContraido(nuevo);
    guardarMenuContraido(nuevo);
  };

  return (
    <div
      className={conMenu ? 'estructura' : 'estructura estructura--minima'}
      data-menu={conMenu && menuContraido ? 'contraido' : undefined}
    >
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <Encabezado
        conMenu={conMenu}
        menuAbierto={menuAbierto}
        alAlternarMenu={() => setMenuAbierto((abierto) => !abierto)}
        menuContraido={menuContraido}
        alAlternarContraido={alternarContraido}
      />
      {conMenu && (
        <nav
          id="menu-principal"
          className="menu"
          aria-label="Menú principal"
          data-abierto={menuAbierto}
        >
          {GRUPOS_MENU.map((grupo) => {
            const delGrupo = entradas.filter((entrada) => entrada.grupo === grupo);
            if (delGrupo.length === 0) return null;
            return (
              <div key={grupo} className="menu__grupo">
                <p className="menu__rotulo" id={`menu-grupo-${grupo}`}>
                  {grupo}
                </p>
                <ul className="menu__lista" aria-labelledby={`menu-grupo-${grupo}`}>
                  {delGrupo.map((entrada) => (
                    <li key={entrada.ruta}>
                      <NavLink
                        to={entrada.ruta}
                        end={entrada.ruta === '/'}
                        className="menu__enlace"
                        // Contraído solo se ve el icono: el nombre aparece al pasar el cursor.
                        title={menuContraido ? entrada.etiqueta : undefined}
                        onClick={() => setMenuAbierto(false)}
                      >
                        <Icono nombre={entrada.icono} />
                        <span className="menu__texto">{entrada.etiqueta}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      )}
      {conMenu && menuAbierto && (
        <button
          type="button"
          className="menu-velo"
          aria-label="Cerrar el menú"
          tabIndex={-1}
          onClick={() => setMenuAbierto(false)}
        />
      )}
      <main id="contenido" className="contenido" tabIndex={-1}>
        <ProveedorNotificaciones>
          <Outlet />
        </ProveedorNotificaciones>
      </main>
    </div>
  );
}
