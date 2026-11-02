import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';

import { useSesionActual } from '../modulos/auth/ContextoSesion.js';
import { urlApi } from '../lib/api.js';
import { guardarMenuContraido, menuContraidoGuardado } from '../lib/menu-lateral.js';
import { useModoPantalla } from '../lib/modo-pantalla.js';
import { entradasVisibles, GRUPOS_MENU } from '../modulos/navegacion/menu.js';

import { AvisosEnVivo } from './AvisosEnVivo.js';
import { Boton } from './Boton.js';
import { Encabezado } from './Encabezado.js';
import { Icono } from './Icono.js';
import { ProveedorNotificaciones } from './Notificaciones.js';

/**
 * Estructura de las pantallas con sesión (layout A, D172): panel lateral a toda la altura con la marca
 * y los módulos por grupo, y a su derecha el encabezado y el contenido.
 *
 * - Escritorio: el panel se despliega (248 px) o se pliega a un riel de iconos (72 px); se recuerda.
 * - Tableta: arranca como riel; desplegarlo lo abre encima del contenido sin moverlo.
 * - Celular: el panel es un cajón que se abre con el botón ☰ del encabezado.
 *
 * Si la persona solo tiene acceso a "Inicio" (por ejemplo, el digitador) no hay panel: queda una
 * estructura mínima, pensada para celular.
 */
export function Estructura() {
  const { permisos, empresa } = useSesionActual();
  const modo = useModoPantalla();
  // Cajón del celular.
  const [menuAbierto, setMenuAbierto] = useState(false);
  // Preferencia de escritorio (se recuerda entre visitas).
  const [menuContraido, setMenuContraido] = useState(menuContraidoGuardado);
  // En tableta el panel desplegado flota sobre el contenido y no se recuerda.
  const [flotante, setFlotante] = useState(false);

  const entradas = entradasVisibles(permisos);
  // El menú solo sirve si hay a dónde ir además de Inicio (el digitador va directo a su cola).
  const conMenu = entradas.filter((entrada) => entrada.ruta !== '/').length > 1;
  const conAvisos =
    permisos.includes('remesa.registrar') || permisos.includes('remesa.tomar_completar');

  const plegado = modo === 'escritorio' ? menuContraido : modo === 'tableta' ? !flotante : false;
  const estadoMenu = !conMenu
    ? undefined
    : modo === 'tableta' && flotante
      ? 'flotante'
      : plegado
        ? 'contraido'
        : undefined;
  const veloVisible =
    conMenu && (modo === 'celular' ? menuAbierto : modo === 'tableta' && flotante);

  // Al cambiar de ancho se cierran el cajón y el panel flotante: cada modo arranca en su estado normal.
  const [modoPrevio, setModoPrevio] = useState(modo);
  if (modo !== modoPrevio) {
    setModoPrevio(modo);
    setMenuAbierto(false);
    setFlotante(false);
  }

  // Escape cierra el cajón o el panel flotante.
  useEffect(() => {
    if (!menuAbierto && !flotante) return;
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return;
      setMenuAbierto(false);
      setFlotante(false);
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [menuAbierto, flotante]);

  const alternarPlegado = () => {
    if (modo === 'tableta') {
      setFlotante((abierto) => !abierto);
      return;
    }
    const nuevo = !menuContraido;
    setMenuContraido(nuevo);
    guardarMenuContraido(nuevo);
  };

  const cerrarTodo = () => {
    setMenuAbierto(false);
    setFlotante(false);
  };

  const etiquetaPlegar = plegado ? 'Expandir el menú' : 'Contraer el menú';

  return (
    <div
      className={conMenu ? 'estructura' : 'estructura estructura--minima'}
      data-menu={estadoMenu}
    >
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
          <div className="menu__marca">
            {empresa?.logoUrl ? (
              <img className="menu__logo" src={urlApi(empresa.logoUrl)} alt="" />
            ) : (
              <span className="menu__sello" aria-hidden="true">
                <Icono nombre="flecha" />
              </span>
            )}
            <span className="menu__nombre menu__texto">{empresa?.nombre ?? 'Cambios JC'}</span>
            <Boton
              variante="fantasma"
              className="boton--icono menu__cerrar"
              aria-label="Cerrar el menú"
              onClick={() => setMenuAbierto(false)}
            >
              <Icono nombre="cerrar" grande />
            </Boton>
          </div>
          <div className="menu__grupos">
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
                          // Plegado solo se ve el icono: el nombre aparece al pasar el cursor.
                          title={plegado && modo !== 'celular' ? entrada.etiqueta : undefined}
                          onClick={cerrarTodo}
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
          </div>
          <div className="menu__pie">
            <button
              type="button"
              className="menu__plegar"
              aria-label={etiquetaPlegar}
              title={plegado ? etiquetaPlegar : undefined}
              aria-expanded={!plegado}
              aria-controls="menu-principal"
              onClick={alternarPlegado}
            >
              <Icono nombre="plegar" />
              <span className="menu__texto" aria-hidden="true">
                {plegado ? 'Expandir' : 'Contraer'}
              </span>
            </button>
          </div>
        </nav>
      )}
      {veloVisible && (
        <button
          type="button"
          className="menu-velo"
          aria-label="Cerrar el menú"
          tabIndex={-1}
          onClick={cerrarTodo}
        />
      )}
      <main id="contenido" className="contenido" tabIndex={-1}>
        <ProveedorNotificaciones>
          {conAvisos && <AvisosEnVivo />}
          <Outlet />
        </ProveedorNotificaciones>
      </main>
    </div>
  );
}
