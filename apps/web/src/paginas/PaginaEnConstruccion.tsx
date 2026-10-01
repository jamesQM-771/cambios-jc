import { Aviso } from '../componentes/Aviso.js';
import { useTitulo } from '../lib/titulo.js';

/** Pantalla provisional: se reemplaza por la real en la segunda parte de la tarea 0.10. */
export function PaginaEnConstruccion({ titulo }: { titulo: string }) {
  useTitulo(titulo);
  return (
    <>
      <h1>{titulo}</h1>
      <Aviso tipo="info">Esta pantalla estará disponible muy pronto.</Aviso>
    </>
  );
}
