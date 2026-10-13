import { Link, Navigate } from 'react-router';

import { Aviso } from '../componentes/Aviso.js';
import { Icono } from '../componentes/Icono.js';
import { ETIQUETAS_ROL } from '../lib/formato.js';
import { useTitulo } from '../lib/titulo.js';
import { useSesionActual } from '../modulos/auth/ContextoSesion.js';
import { entradasVisibles } from '../modulos/navegacion/menu.js';

export function PaginaInicio() {
  useTitulo();
  const { usuario, permisos, empresa } = useSesionActual();
  const accesos = entradasVisibles(permisos).filter((entrada) => entrada.ruta !== '/');

  // Quien solo tiene una pantalla (el digitador) entra directo a ella, sin pasos de más.
  if (accesos.length === 1 && accesos[0]) return <Navigate to={accesos[0].ruta} replace />;

  return (
    <>
      <div className="cabecera-pagina">
        <h1>Hola, {usuario.nombre}</h1>
        <p>
          {ETIQUETAS_ROL[usuario.rol]}
          {empresa ? ` · ${empresa.nombre}` : ''}
        </p>
      </div>
      {accesos.length > 0 ? (
        <ul className="accesos">
          {accesos.map((acceso) => (
            <li key={acceso.ruta}>
              <Link to={acceso.ruta}>
                <span className="accesos__icono">
                  <Icono nombre={acceso.icono} grande />
                </span>
                <span>
                  <strong>{acceso.etiqueta}</strong>
                  {acceso.descripcion}
                </span>
                <span className="accesos__ir">
                  Abrir
                  <Icono nombre="flecha" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Aviso tipo="info">
          Por ahora no tienes pantallas disponibles. Las de operación se irán habilitando en las
          siguientes fases del sistema.
        </Aviso>
      )}
    </>
  );
}
