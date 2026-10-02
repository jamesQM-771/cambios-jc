import { useEffect, useState } from 'react';

/**
 * Devuelve `valor` con retraso: solo cambia cuando la persona deja de escribir durante `milisegundos`.
 * Sirve para no pedir a la API una consulta por cada letra de una búsqueda.
 */
export function useRetraso<T>(valor: T, milisegundos = 300): T {
  const [conRetraso, setConRetraso] = useState(valor);
  useEffect(() => {
    const temporizador = setTimeout(() => setConRetraso(valor), milisegundos);
    return () => clearTimeout(temporizador);
  }, [valor, milisegundos]);
  return conRetraso;
}
