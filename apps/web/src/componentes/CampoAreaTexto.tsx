import { useId, type Ref, type TextareaHTMLAttributes } from 'react';

interface PropiedadesAreaTexto extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  etiqueta: string;
  ayuda?: string;
  error?: string | undefined;
  ref?: Ref<HTMLTextAreaElement>;
}

/** Texto de varias líneas con etiqueta, ayuda y error asociados para lectores de pantalla. */
export function CampoAreaTexto({
  etiqueta,
  ayuda,
  error,
  className,
  ref,
  ...resto
}: PropiedadesAreaTexto) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const descripcion = [ayuda && idAyuda, error && idError].filter(Boolean).join(' ') || undefined;
  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <textarea
        id={id}
        ref={ref}
        rows={3}
        className={['campo__entrada', className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={descripcion}
        {...resto}
      />
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
