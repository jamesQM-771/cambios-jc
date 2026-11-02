import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { urlApi } from '../lib/api.js';
import { ETIQUETAS_ROL } from '../lib/formato.js';
import { cerrarSesion } from '../modulos/auth/api.js';
import { useMarcarSalidaVoluntaria } from '../modulos/auth/ContextoSalida.js';
import { useSesionActual } from '../modulos/auth/ContextoSesion.js';
import { CLAVE_SESION } from '../modulos/auth/sesion.js';

import { Boton } from './Boton.js';
import { BotonTema } from './BotonTema.js';
import { Icono } from './Icono.js';

interface PropiedadesEncabezado {
  /** Si hay menú lateral, muestra el botón que lo abre en celular. */
  conMenu: boolean;
  menuAbierto: boolean;
  alAlternarMenu: () => void;
}

/** Fecha de hoy en Colombia para el encabezado: "lunes, 2 de noviembre". */
function fechaDeHoy(): string {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Bogota',
  }).format(new Date());
}

/** Iniciales para el avatar: primera letra del nombre y del primer apellido. */
function inicialesDe(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  const primera = palabras[0]?.charAt(0) ?? '';
  const segunda = palabras.length > 1 ? (palabras[1]?.charAt(0) ?? '') : '';
  return (primera + segunda).toUpperCase();
}

export function Encabezado({ conMenu, menuAbierto, alAlternarMenu }: PropiedadesEncabezado) {
  const { usuario, empresa } = useSesionActual();
  const cliente = useQueryClient();
  const navegar = useNavigate();
  const marcarSalidaVoluntaria = useMarcarSalidaVoluntaria();

  const salir = useMutation({
    mutationFn: cerrarSesion,
    // Aunque el servidor no responda, la persona sale de la pantalla: la sesión local se descarta.
    onSettled: () => {
      marcarSalidaVoluntaria();
      cliente.setQueryData(CLAVE_SESION, null);
      void navegar('/acceso', { replace: true });
    },
  });

  return (
    <header className="encabezado">
      <div className="encabezado__izquierda">
        {conMenu && (
          <Boton
            variante="fantasma"
            className="boton-menu boton--icono"
            aria-label="Menú"
            aria-expanded={menuAbierto}
            aria-controls="menu-principal"
            onClick={alAlternarMenu}
          >
            <Icono nombre="menu" grande />
          </Boton>
        )}
        {/* Con panel lateral la marca vive en el panel; aquí solo se ve en celular. */}
        <div
          className={
            conMenu ? 'encabezado__empresa encabezado__empresa--celular' : 'encabezado__empresa'
          }
        >
          {empresa?.logoUrl ? (
            <img src={urlApi(empresa.logoUrl)} alt="" />
          ) : (
            <span className="encabezado__sello" aria-hidden="true">
              <Icono nombre="flecha" />
            </span>
          )}
          <span>{empresa?.nombre ?? 'Cambios JC'}</span>
        </div>
        {conMenu && <p className="encabezado__fecha">{fechaDeHoy()}</p>}
      </div>
      <div className="encabezado__derecha">
        <div className="encabezado__persona">
          <span className="avatar" aria-hidden="true">
            {inicialesDe(usuario.nombre)}
          </span>
          <div className="encabezado__usuario">
            {usuario.nombre}
            <small>{ETIQUETAS_ROL[usuario.rol]}</small>
          </div>
        </div>
        <BotonTema />
        <Boton
          variante="fantasma"
          className="boton--icono"
          aria-label="Salir"
          title="Salir"
          cargando={salir.isPending}
          onClick={() => salir.mutate()}
        >
          <Icono nombre="salir" grande />
        </Boton>
      </div>
    </header>
  );
}
