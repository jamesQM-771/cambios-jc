import { NavLink, Outlet } from 'react-router';

import { useTitulo } from '../../lib/titulo.js';

const SECCIONES = [
  { ruta: 'bancos', etiqueta: 'Bancos' },
  { ruta: 'sucursales', etiqueta: 'Sucursales' },
  { ruta: 'cajas', etiqueta: 'Cajas' },
  { ruta: 'denominaciones', etiqueta: 'Denominaciones' },
  { ruta: 'lineas-negocio', etiqueta: 'Líneas de negocio' },
  { ruta: 'cuentas', etiqueta: 'Cuentas' },
  { ruta: 'categorias-gasto', etiqueta: 'Categorías de gasto' },
  { ruta: 'tasas', etiqueta: 'Tasas' },
] as const;

/**
 * Sección "Configuración": sub-navegación propia (igual de accesible que el menú principal, pero
 * acotada a esta pantalla) y el contenido de cada sub-ruta en el `<Outlet>`.
 */
export function PaginaConfiguracion() {
  useTitulo('Configuración');

  return (
    <>
      <div className="cabecera-pagina">
        <h1>Configuración</h1>
        <p>
          Sucursales, cajas, denominaciones, líneas de negocio, bancos, cuentas, categorías de gasto
          y tasas.
        </p>
      </div>
      <nav className="subnav" aria-label="Secciones de configuración">
        <ul className="subnav__lista">
          {SECCIONES.map((seccion) => (
            <li key={seccion.ruta}>
              <NavLink to={seccion.ruta} className="subnav__enlace">
                {seccion.etiqueta}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="subnav__contenido">
        <Outlet />
      </div>
    </>
  );
}
