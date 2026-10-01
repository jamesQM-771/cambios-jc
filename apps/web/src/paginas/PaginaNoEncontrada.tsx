import { Link } from 'react-router';

import { useTitulo } from '../lib/titulo.js';

export function PaginaNoEncontrada() {
  useTitulo('Página no encontrada');
  return (
    <>
      <h1>Página no encontrada</h1>
      <p>La dirección que abriste no existe.</p>
      <Link className="boton" to="/">
        Ir al inicio
      </Link>
    </>
  );
}
