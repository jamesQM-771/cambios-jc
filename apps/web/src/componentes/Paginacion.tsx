import { Boton } from './Boton.js';

interface PropiedadesPaginacion {
  pagina: number;
  porPagina: number;
  total: number;
  alCambiar: (pagina: number) => void;
}

/** "Mostrando 21–40 de 135" con botones Anterior y Siguiente. */
export function Paginacion({ pagina, porPagina, total, alCambiar }: PropiedadesPaginacion) {
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);
  const hayAnterior = pagina > 1;
  const haySiguiente = pagina * porPagina < total;
  return (
    <nav className="paginacion" aria-label="Paginación">
      <span className="paginacion__resumen" role="status">
        {total === 0
          ? 'Sin resultados'
          : `Mostrando ${String(desde)}–${String(hasta)} de ${String(total)}`}
      </span>
      <div className="acciones">
        <Boton
          variante="secundario"
          chico
          disabled={!hayAnterior}
          onClick={() => alCambiar(pagina - 1)}
        >
          Anterior
        </Boton>
        <Boton
          variante="secundario"
          chico
          disabled={!haySiguiente}
          onClick={() => alCambiar(pagina + 1)}
        >
          Siguiente
        </Boton>
      </div>
    </nav>
  );
}
