import { useState } from 'react';

import { alternarTema, temaActual } from '../lib/tema.js';

import { Boton } from './Boton.js';
import { Icono } from './Icono.js';

export function BotonTema() {
  const [tema, setTema] = useState(temaActual);
  const destino = tema === 'oscuro' ? 'claro' : 'oscuro';
  return (
    <Boton
      variante="fantasma"
      className="boton--icono"
      onClick={() => setTema(alternarTema())}
      aria-label={`Cambiar al tema ${destino}`}
      title={`Cambiar al tema ${destino}`}
    >
      <Icono nombre={tema === 'oscuro' ? 'sol' : 'luna'} grande />
    </Boton>
  );
}
