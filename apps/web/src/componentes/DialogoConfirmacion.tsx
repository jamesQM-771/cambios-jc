import type { ReactNode } from 'react';

import { Aviso } from './Aviso.js';
import { Boton } from './Boton.js';
import { Dialogo } from './Dialogo.js';

interface PropiedadesConfirmacion {
  abierto: boolean;
  titulo: string;
  /** Qué va a pasar, en palabras de quien usa el sistema. */
  children: ReactNode;
  textoConfirmar: string;
  alConfirmar: () => void;
  alCancelar: () => void;
  cargando?: boolean;
  /** Mensaje de error de la acción, si falló. El diálogo sigue abierto para poder reintentar o cancelar. */
  error?: string | undefined;
  peligrosa?: boolean;
}

/** Pide confirmación antes de una acción delicada. */
export function DialogoConfirmacion({
  abierto,
  titulo,
  children,
  textoConfirmar,
  alConfirmar,
  alCancelar,
  cargando = false,
  error,
  peligrosa = false,
}: PropiedadesConfirmacion) {
  return (
    <Dialogo abierto={abierto} alCerrar={alCancelar} titulo={titulo}>
      <div>{children}</div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="acciones acciones--derecha">
        <Boton variante="secundario" onClick={alCancelar} disabled={cargando}>
          Cancelar
        </Boton>
        <Boton
          variante={peligrosa ? 'peligro' : 'primario'}
          onClick={alConfirmar}
          cargando={cargando}
        >
          {textoConfirmar}
        </Boton>
      </div>
    </Dialogo>
  );
}
