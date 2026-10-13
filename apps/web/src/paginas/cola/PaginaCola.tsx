import { Aviso } from '../../componentes/Aviso.js';
import { EncabezadoPagina, EstadoVacio, Esqueleto } from '../../componentes/Pagina.js';
import { mensajeDe } from '../../lib/api.js';
import { useTitulo } from '../../lib/titulo.js';
import { useCola } from '../../modulos/cola/consultas.js';

import { TarjetaTransferencia } from './TarjetaTransferencia.js';

/**
 * Cola del digitador (§5.4): lo que hay que pagar, de la más antigua a la más nueva. Pensada para
 * el teléfono: tarjetas, botones grandes y datos listos para copiar.
 */
export function PaginaCola() {
  useTitulo('Cola de pagos');
  const cola = useCola();

  const items = cola.data?.remesas ?? [];
  // Primero lo que la persona ya tiene tomado: es lo que tiene que terminar.
  const mias = items.filter((item) => item.tomadaPorMi);
  const enEspera = items.filter((item) => !item.tomadaPorMi);

  return (
    <>
      <EncabezadoPagina
        titulo="Cola de pagos"
        descripcion="Toma una transferencia, págala desde tu banco y sube la captura del comprobante."
      />

      {cola.isPending && <Esqueleto texto="Cargando la cola…" />}
      {cola.isError && <Aviso tipo="error">{mensajeDe(cola.error)}</Aviso>}

      {cola.data && items.length === 0 && (
        <EstadoVacio
          titulo="No hay transferencias por pagar"
          descripcion="Cuando llegue una nueva aparecerá aquí sola."
          icono="exito"
        />
      )}

      {mias.length > 0 && (
        <section aria-labelledby="titulo-mias">
          <h3 id="titulo-mias">Las que tienes tomadas ({mias.length})</h3>
          <ul className="transferencias">
            {mias.map((item) => (
              <TarjetaTransferencia
                key={item.id}
                item={item}
                cuentas={cola.data?.cuentasOrigen ?? []}
                cuentaSugeridaId={cola.data?.ultimaCuentaOrigenId ?? null}
              />
            ))}
          </ul>
        </section>
      )}

      {enEspera.length > 0 && (
        <section aria-labelledby="titulo-espera">
          <h3 id="titulo-espera">En espera ({enEspera.length})</h3>
          <ul className="transferencias">
            {enEspera.map((item) => (
              <TarjetaTransferencia
                key={item.id}
                item={item}
                cuentas={cola.data?.cuentasOrigen ?? []}
                cuentaSugeridaId={cola.data?.ultimaCuentaOrigenId ?? null}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
