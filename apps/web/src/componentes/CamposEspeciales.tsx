import { useEffect, useId, useRef, type InputHTMLAttributes } from 'react';

import { PAISES_TELEFONO, separarTelefono, unirTelefono } from '../lib/telefono.js';

import { Campo } from './Campo.js';

interface PropiedadesCampoDigitos extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'inputMode'
> {
  etiqueta: string;
  ayuda?: string;
  error?: string | undefined;
  valor: string;
  alCambiar: (valor: string) => void;
}

/**
 * Campo que solo admite dígitos. Lo que no sea un número se descarta al escribir o al pegar, y en
 * celular abre el teclado numérico. No usa `type="number"`: ese quita ceros a la izquierda y
 * acepta signos y exponentes.
 */
export function CampoDigitos({ valor, alCambiar, maxLength, ...resto }: PropiedadesCampoDigitos) {
  return (
    <Campo
      {...resto}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={valor}
      // El largo máximo se aplica aquí, después de limpiar: el `maxLength` del navegador cortaría
      // un texto pegado ("NIT 900.123…") antes de quitarle lo que no son números.
      onChange={(evento) => {
        const digitos = evento.target.value.replace(/\D/g, '');
        alCambiar(maxLength === undefined ? digitos : digitos.slice(0, maxLength));
      }}
    />
  );
}

interface PropiedadesCampoTelefono {
  etiqueta: string;
  ayuda?: string;
  error?: string | undefined;
  /** Teléfono como se guarda: `+573001234567`, o vacío. */
  valor: string;
  alCambiar: (valor: string) => void;
  /** País elegido mientras el número está vacío (un valor vacío no guarda prefijo). */
  prefijo: string;
  alCambiarPrefijo: (prefijo: string) => void;
}

/** Teléfono con selector de país. Entrega el valor ya unido en formato internacional. */
export function CampoTelefono({
  etiqueta,
  ayuda,
  error,
  valor,
  alCambiar,
  prefijo,
  alCambiarPrefijo,
}: PropiedadesCampoTelefono) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const descripcion = [ayuda && idAyuda, error && idError].filter(Boolean).join(' ') || undefined;
  const { numero } = separarTelefono(valor);

  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <div className="campo-telefono">
        <select
          className="campo__entrada campo-telefono__pais"
          aria-label={`País de ${etiqueta}`}
          value={prefijo}
          onChange={(evento) => {
            alCambiarPrefijo(evento.target.value);
            alCambiar(unirTelefono(evento.target.value, numero));
          }}
        >
          {PAISES_TELEFONO.map((pais) => (
            <option key={pais.codigo} value={pais.prefijo}>
              {pais.nombre} (+{pais.prefijo})
            </option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          className="campo__entrada mono"
          aria-invalid={error ? true : undefined}
          aria-describedby={descripcion}
          value={numero}
          maxLength={12}
          onChange={(evento) => {
            alCambiar(unirTelefono(prefijo, evento.target.value));
          }}
        />
      </div>
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

/**
 * Lista de lo que hay que corregir, arriba del formulario. Recibe el foco cuando aparece o cambia,
 * para que quien usa teclado o lector de pantalla sepa que el envío falló. Los errores de cada
 * campo siguen mostrándose junto al campo.
 */
export function ResumenErrores({ errores }: { errores: readonly string[] }) {
  const caja = useRef<HTMLDivElement>(null);
  const clave = errores.join('|');
  useEffect(() => {
    if (clave !== '') caja.current?.focus();
  }, [clave]);

  if (errores.length === 0) return null;
  return (
    <div ref={caja} className="aviso aviso--error resumen-errores" role="alert" tabIndex={-1}>
      <div className="aviso__texto">
        <p>
          <strong>
            {errores.length === 1
              ? 'Hay un dato por corregir:'
              : `Hay ${String(errores.length)} datos por corregir:`}
          </strong>
        </p>
        <ul>
          {errores.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
