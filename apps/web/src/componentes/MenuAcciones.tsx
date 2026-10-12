import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { Icono } from './Icono.js';

export interface AccionMenu {
  etiqueta: string;
  alElegir: () => void;
  /** Acción que quita o bloquea algo: se pinta en rojo y va separada del resto. */
  peligro?: boolean;
  deshabilitada?: boolean;
}

interface PropiedadesMenuAcciones {
  /** Nombre accesible del botón, con el registro al que aplica: "Más acciones de Banesco". */
  etiqueta: string;
  acciones: readonly AccionMenu[];
}

/**
 * Menú de acciones de una fila. Se abre con clic, Enter o espacio; dentro se recorre con las
 * flechas, Inicio y Fin; se cierra con Escape, al elegir o al hacer clic fuera, y devuelve el foco
 * al botón que lo abrió.
 */
export function MenuAcciones({ etiqueta, acciones }: PropiedadesMenuAcciones) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const idMenu = useId();

  useEffect(() => {
    if (!abierto) return;
    const elementos = (): HTMLButtonElement[] =>
      Array.from(
        contenedor.current?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]:not(:disabled)',
        ) ?? [],
      );
    elementos()[0]?.focus();

    const alPulsarFuera = (evento: MouseEvent) => {
      if (evento.target instanceof Node && !contenedor.current?.contains(evento.target)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', alPulsarFuera);
    return () => {
      document.removeEventListener('mousedown', alPulsarFuera);
    };
  }, [abierto]);

  const cerrarYVolver = () => {
    setAbierto(false);
    boton.current?.focus();
  };

  const alTeclear = (evento: KeyboardEvent<HTMLDivElement>) => {
    const elementos = Array.from(
      evento.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
    );
    const actual = elementos.findIndex((elemento) => elemento === document.activeElement);
    const ir = (indice: number) => {
      evento.preventDefault();
      elementos[(indice + elementos.length) % elementos.length]?.focus();
    };
    if (evento.key === 'Escape') {
      evento.preventDefault();
      cerrarYVolver();
    } else if (evento.key === 'ArrowDown') ir(actual + 1);
    else if (evento.key === 'ArrowUp') ir(actual - 1);
    else if (evento.key === 'Home') ir(0);
    else if (evento.key === 'End') ir(elementos.length - 1);
    else if (evento.key === 'Tab') setAbierto(false);
  };

  return (
    <div className="menu-acciones" ref={contenedor}>
      <button
        ref={boton}
        type="button"
        className="boton boton--fantasma boton--icono boton--chico"
        aria-label={etiqueta}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        onClick={() => {
          setAbierto((valor) => !valor);
        }}
      >
        <Icono nombre="mas" grande />
      </button>
      {abierto && (
        <div
          id={idMenu}
          role="menu"
          aria-label={etiqueta}
          className="menu-acciones__lista"
          onKeyDown={alTeclear}
        >
          {acciones.map((accion) => (
            <button
              key={accion.etiqueta}
              type="button"
              role="menuitem"
              className={
                accion.peligro
                  ? 'menu-acciones__opcion menu-acciones__opcion--peligro'
                  : 'menu-acciones__opcion'
              }
              disabled={accion.deshabilitada}
              onClick={() => {
                cerrarYVolver();
                accion.alElegir();
              }}
            >
              {accion.etiqueta}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
