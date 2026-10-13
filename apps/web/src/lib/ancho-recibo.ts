import { useState } from 'react';

import type { AnchoRecibo } from '../modulos/recibos/tipos.js';

const CLAVE = 'cambios-jc:ancho-recibo';

function leer(): AnchoRecibo {
  try {
    return window.localStorage.getItem(CLAVE) === '58' ? 58 : 80;
  } catch {
    return 80; // sin acceso al almacenamiento: papel de 80 mm
  }
}

/**
 * Ancho del papel de la impresora de este equipo (58 u 80 mm). Es una elección del equipo, no de
 * la empresa: cada caja puede tener una impresora distinta (D110).
 */
export function useAnchoRecibo(): [AnchoRecibo, (ancho: AnchoRecibo) => void] {
  const [ancho, setAncho] = useState<AnchoRecibo>(leer);
  const cambiar = (nuevo: AnchoRecibo) => {
    setAncho(nuevo);
    try {
      window.localStorage.setItem(CLAVE, String(nuevo));
    } catch {
      // No se pudo recordar; el cambio vale para esta visita.
    }
  };
  return [ancho, cambiar];
}
