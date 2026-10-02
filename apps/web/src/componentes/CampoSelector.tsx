import { useId, type ReactNode, type Ref, type SelectHTMLAttributes } from 'react';

interface PropiedadesSelector extends SelectHTMLAttributes<HTMLSelectElement> {
  etiqueta: string;
  ayuda?: string;
  error?: string | undefined;
  /** Las opciones (`<option>`). */
  children: ReactNode;
  ref?: Ref<HTMLSelectElement>;
}

/** Lista desplegable con etiqueta, ayuda y error asociados para lectores de pantalla. */
export function CampoSelector({
  etiqueta,
  ayuda,
  error,
  className,
  children,
  ref,
  ...resto
}: PropiedadesSelector) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const descripcion = [ayuda && idAyuda, error && idError].filter(Boolean).join(' ') || undefined;
  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <select
        id={id}
        ref={ref}
        className={['campo__entrada', className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={descripcion}
        {...resto}
      >
        {children}
      </select>
      {ayuda && (
        <span id={idAyuda} className="campo__ayuda">
          {ayuda}
        </span>
      )}
      {error && (
        <span id={idError} className="campo__error">
          {error}
        </span>
      )}
    </div>
  );
}
