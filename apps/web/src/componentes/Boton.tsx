import type { ButtonHTMLAttributes } from 'react';

type Variante = 'primario' | 'secundario' | 'peligro';

interface PropiedadesBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  chico?: boolean;
  ancho?: boolean;
  /** Mientras está en proceso se deshabilita para evitar enviar dos veces. */
  cargando?: boolean;
}

export function Boton({
  variante = 'primario',
  chico = false,
  ancho = false,
  cargando = false,
  type = 'button',
  className,
  children,
  disabled,
  ...resto
}: PropiedadesBoton) {
  const clases = [
    'boton',
    variante !== 'primario' && `boton--${variante}`,
    chico && 'boton--chico',
    ancho && 'boton--ancho',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type={type}
      className={clases}
      disabled={disabled === true || cargando}
      aria-busy={cargando || undefined}
      {...resto}
    >
      {children}
    </button>
  );
}
