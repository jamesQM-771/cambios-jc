import { useState } from 'react';

import { alternarTema, temaActual } from '../lib/tema.js';

import { Boton } from './Boton.js';

export function BotonTema() {
  const [tema, setTema] = useState(temaActual);
  const destino = tema === 'oscuro' ? 'claro' : 'oscuro';
  return (
    <Boton
      variante="secundario"
      chico
      onClick={() => setTema(alternarTema())}
      aria-label={`Cambiar al tema ${destino}`}
    >
      {tema === 'oscuro' ? 'Tema claro' : 'Tema oscuro'}
    </Boton>
  );
}
