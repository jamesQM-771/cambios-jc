import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { BotonCopiar } from '../../componentes/BotonCopiar.js';
import { Dialogo } from '../../componentes/Dialogo.js';

export interface ContrasenaTemporalMostrada {
  nombre: string;
  login: string;
  contrasena: string;
  /** `true` si el usuario acaba de crearse; `false` si se restableció la de uno existente. */
  esNuevo: boolean;
}

interface PropiedadesDialogo {
  datos: ContrasenaTemporalMostrada | null;
  alCerrar: () => void;
}

/**
 * Muestra la contraseña temporal. El servidor solo la entrega una vez y no se guarda en ningún lado:
 * si se cierra sin copiarla, la única salida es restablecerla de nuevo.
 */
export function DialogoContrasenaTemporal({ datos, alCerrar }: PropiedadesDialogo) {
  return (
    <Dialogo
      abierto={datos !== null}
      alCerrar={alCerrar}
      titulo={datos?.esNuevo ? 'Usuario creado' : 'Contraseña restablecida'}
    >
      {datos && (
        <>
          <p>
            Entrégale a <strong>{datos.nombre}</strong> estos datos para entrar
            {datos.esNuevo ? '' : ' (el usuario es el mismo de siempre)'}:
          </p>
          <dl className="datos-registro">
            <dt>Usuario</dt>
            <dd>
              <code>{datos.login}</code>
            </dd>
          </dl>
          <div className="temporal">
            <span className="solo-lectores">Contraseña temporal:</span>
            <code>{datos.contrasena}</code>
            <BotonCopiar texto={datos.contrasena} />
          </div>
          <Aviso tipo="advertencia">
            <strong>Solo se muestra esta vez.</strong> No queda guardada en ningún lado. Al entrar,
            la persona deberá cambiarla.
          </Aviso>
          <div className="acciones acciones--derecha">
            <Boton onClick={alCerrar}>Listo</Boton>
          </div>
        </>
      )}
    </Dialogo>
  );
}
