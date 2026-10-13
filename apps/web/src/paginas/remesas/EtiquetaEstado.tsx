import { ETIQUETAS_ESTADO, TONO_ESTADO, type EstadoRemesa } from '../../modulos/remesas/tipos.js';

/** Estado de una remesa como etiqueta: el color acompaña al texto, nunca lo reemplaza. */
export function EtiquetaEstado({ estado }: { estado: EstadoRemesa }) {
  const tono = TONO_ESTADO[estado];
  return (
    <span className={tono === 'neutro' ? 'etiqueta' : `etiqueta etiqueta--${tono}`}>
      {ETIQUETAS_ESTADO[estado]}
    </span>
  );
}
