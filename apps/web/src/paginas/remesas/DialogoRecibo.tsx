import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { BotonCopiar } from '../../componentes/BotonCopiar.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { ReciboTicket } from '../../componentes/ReciboTicket.js';
import { useAnchoRecibo } from '../../lib/ancho-recibo.js';
import { mensajeDe } from '../../lib/api.js';
import { emitirRecibo } from '../../modulos/recibos/api.js';
import type { AnchoRecibo, Recibo } from '../../modulos/recibos/tipos.js';

interface PropiedadesDialogoRecibo {
  /** Remesa de la que se emite el recibo; `null` mantiene el diálogo cerrado. */
  remesa: { id: string; numeroComprobante: number } | null;
  alCerrar: () => void;
}

export function DialogoRecibo({ remesa, alCerrar }: PropiedadesDialogoRecibo) {
  return (
    <Dialogo abierto={remesa !== null} alCerrar={alCerrar} titulo="Recibo">
      {/* La clave reinicia el estado: cada remesa empieza sin recibo emitido. */}
      {remesa && <ContenidoRecibo key={remesa.id} remesa={remesa} alCerrar={alCerrar} />}
    </Dialogo>
  );
}

function ContenidoRecibo({
  remesa,
  alCerrar,
}: {
  remesa: { id: string; numeroComprobante: number };
  alCerrar: () => void;
}) {
  const [recibo, setRecibo] = useState<Recibo | null>(null);
  const [ancho, cambiarAncho] = useAnchoRecibo();

  // Emitir deja una impresión registrada (la primera es el original, las demás COPIA, D110): por
  // eso solo se hace por una acción de la persona, nunca al abrir la pantalla.
  const emitir = useMutation({
    mutationFn: () => emitirRecibo(remesa.id),
    onSuccess: ({ recibo: nuevo }) => {
      setRecibo(nuevo);
      // Da un instante a que el ticket se dibuje antes de abrir la impresión.
      setTimeout(() => window.print(), 100);
    },
  });

  return (
    <div>
      {emitir.isError && <Aviso tipo="error">{mensajeDe(emitir.error)}</Aviso>}
      {!recibo ? (
        <>
          <p>
            Se imprime el recibo del comprobante N° <strong>{remesa.numeroComprobante}</strong>. Las
            siguientes impresiones salen marcadas como COPIA.
          </p>
          <div className="acciones acciones--derecha">
            <Boton variante="secundario" onClick={alCerrar}>
              Cerrar
            </Boton>
            <Boton cargando={emitir.isPending} onClick={() => emitir.mutate()}>
              Emitir e imprimir
            </Boton>
          </div>
        </>
      ) : (
        <>
          <div className="recibo-vista">
            <ReciboTicket recibo={recibo} ancho={ancho} />
          </div>
          <div className="campos-en-fila">
            <label className="campo__casilla">
              Papel
              <select
                className="campo__entrada"
                aria-label="Ancho del papel"
                value={ancho}
                onChange={(evento) => cambiarAncho(Number(evento.target.value) as AnchoRecibo)}
              >
                <option value={80}>80 mm</option>
                <option value={58}>58 mm</option>
              </select>
            </label>
          </div>
          <div className="acciones">
            <Boton chico onClick={() => window.print()}>
              Imprimir
            </Boton>
            <BotonCopiar texto={recibo.texto} etiqueta="Copiar texto" />
            <BotonCopiar texto={recibo.urlSeguimiento} etiqueta="Copiar enlace de seguimiento" />
            <Boton
              variante="fantasma"
              chico
              cargando={emitir.isPending}
              onClick={() => emitir.mutate()}
            >
              Reimprimir como copia
            </Boton>
          </div>
          <div className="acciones acciones--derecha">
            <Boton variante="secundario" onClick={alCerrar}>
              Cerrar
            </Boton>
          </div>
        </>
      )}
    </div>
  );
}
