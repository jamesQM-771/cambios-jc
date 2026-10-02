import { useState } from 'react';

import { Boton } from './Boton.js';

/** Copia un texto al portapapeles y avisa "Copiado". Si el navegador no deja, la persona puede seleccionar el texto. */
export function BotonCopiar({ texto, etiqueta = 'Copiar' }: { texto: string; etiqueta?: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <Boton variante="secundario" chico onClick={() => void copiar()}>
      {copiado ? 'Copiado' : etiqueta}
    </Boton>
  );
}
