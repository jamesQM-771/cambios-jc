import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';

import { useSesionActual } from '../modulos/auth/ContextoSesion.js';
import { entradasVisibles } from '../modulos/navegacion/menu.js';

import { Encabezado } from './Encabezado.js';
import { Icono } from './Icono.js';

/**
 * Estructura de las pantallas con sesión: encabezado, menú lateral y contenido. Si la persona solo
 * tiene acceso a "Inicio" (por ejemplo, el digitador) no se muestra menú: queda una estructura mínima,
 * pensada para celular.
 */
export function Estructura() {
  const { permisos } = useSesionActual();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const entradas = entradasVisibles(permisos);
  const conMenu = entradas.length > 1;

  return (
    <div className={conMenu ? 'estructura' : 'estructura estructura--minima'}>
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <Encabezado
        conMenu={conMenu}
        menuAbierto={menuAbierto}
        alAlternarMenu={() => setMenuAbierto((abierto) => !abierto)}
      />
      {conMenu && (
        <nav
          id="menu-principal"
          className="menu"
          aria-label="Menú principal"
          data-abierto={menuAbierto}
        >
          <ul className="menu__lista">
            {entradas.map((entrada) => (
              <li key={entrada.ruta}>
                <NavLink
                  to={entrada.ruta}
                  end={entrada.ruta === '/'}
                  className="menu__enlace"
                  onClick={() => setMenuAbierto(false)}
                >
                  <Icono nombre={entrada.icono} />
                  {entrada.etiqueta}
                </NavLink>
              </li>
            ))}
          </ul>
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
        <Outlet />
      </main>
    </div>
  );
}
