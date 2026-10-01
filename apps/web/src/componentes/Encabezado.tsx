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

interface PropiedadesEncabezado {
  /** Si hay menú lateral, muestra el botón que lo abre en celular. */
  conMenu: boolean;
  menuAbierto: boolean;
  alAlternarMenu: () => void;
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
            variante="secundario"
            chico
            className="boton-menu"
            aria-expanded={menuAbierto}
            aria-controls="menu-principal"
            onClick={alAlternarMenu}
          >
            Menú
          </Boton>
        )}
        <div className="encabezado__empresa">
          {empresa?.logoUrl && <img src={urlApi(empresa.logoUrl)} alt="" />}
          <span>{empresa?.nombre ?? 'Cambios JC'}</span>
        </div>
      </div>
      <div className="encabezado__derecha">
        <div className="encabezado__usuario">
          {usuario.nombre}
          <small>{ETIQUETAS_ROL[usuario.rol]}</small>
        </div>
        <BotonTema />
        <Boton
          variante="secundario"
          chico
          cargando={salir.isPending}
          onClick={() => salir.mutate()}
        >
          Salir
        </Boton>
      </div>
    </header>
  );
}
