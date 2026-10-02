import { useEffect, useId, useRef, type ReactNode } from 'react';

interface PropiedadesDialogo {
  abierto: boolean;
  /** Se llama al cerrar con Escape, al pulsar fuera del cuadro o al cerrarlo por código. */
  alCerrar: () => void;
  titulo: string;
  children: ReactNode;
  ancho?: boolean;
}

/**
 * Cuadro de diálogo con el elemento nativo `<dialog>`: el navegador se encarga de atrapar el foco,
 * de Escape y del fondo. El contenido solo existe mientras está abierto, así cada vez que se abre
 * los formularios empiezan limpios.
 */
export function Dialogo({
  abierto,
  alCerrar,
  titulo,
  children,
  ancho = false,
}: PropiedadesDialogo) {
  const referencia = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const dialogo = referencia.current;
    if (!dialogo) return;
    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  return (
    <dialog
      ref={referencia}
      className={ancho ? 'dialogo dialogo--ancho' : 'dialogo'}
      aria-labelledby={idTitulo}
      onClose={alCerrar}
      onClick={(evento) => {
        // Un clic sobre el propio <dialog> (y no sobre su contenido) es un clic en el fondo.
        if (evento.target === evento.currentTarget) alCerrar();
      }}
    >
      {abierto && (
        <div className="dialogo__cuerpo">
          <h2 id={idTitulo}>{titulo}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
