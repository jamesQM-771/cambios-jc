import { useId, useState } from 'react';

import { Boton } from '../../componentes/Boton.js';
import { useRetraso } from '../../lib/useRetraso.js';
import { useClientes } from '../../modulos/clientes/consultas.js';
import type { Cliente } from '../../modulos/clientes/tipos.js';

interface PropiedadesSelectorCliente {
  etiqueta: string;
  valor: Cliente | null;
  alCambiar: (cliente: Cliente | null) => void;
  /** Pide registrar un cliente nuevo. El diálogo lo muestra quien usa el selector, fuera de su formulario. */
  alRegistrarNuevo: () => void;
}

/** Elige a una persona buscándola por documento o nombre; si no existe, se puede registrar. */
export function SelectorCliente({
  etiqueta,
  valor,
  alCambiar,
  alRegistrarNuevo,
}: PropiedadesSelectorCliente) {
  const id = useId();
  const [busqueda, setBusqueda] = useState('');
  const buscado = useRetraso(busqueda.trim());
  const resultados = useClientes(buscado.length >= 3 ? buscado : '');
  const hayBusqueda = buscado.length >= 3;
  const clientes = (hayBusqueda ? (resultados.data?.clientes ?? []) : []).filter((c) => c.activo);

  if (valor) {
    return (
      <div className="campo">
        <span className="campo__etiqueta">{etiqueta}</span>
        <div className="cliente-elegido">
          <div>
            <strong>{valor.nombre}</strong>
            <span className="mono">
              {valor.tipoDocumento} {valor.numeroDocumento}
            </span>
          </div>
          <Boton
            variante="fantasma"
            chico
            aria-label={`Cambiar ${etiqueta.toLowerCase()}`}
            onClick={() => alCambiar(null)}
          >
            Cambiar
          </Boton>
        </div>
      </div>
    );
  }

  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <input
        id={id}
        type="search"
        className="campo__entrada"
        autoComplete="off"
        placeholder="Documento o nombre (mínimo 3 caracteres)"
        value={busqueda}
        onChange={(evento) => setBusqueda(evento.target.value)}
      />
      {hayBusqueda && resultados.isPending && <span className="campo__ayuda">Buscando…</span>}
      {clientes.length > 0 && (
        <ul className="resultados-cliente" aria-label={`Resultados de ${etiqueta.toLowerCase()}`}>
          {clientes.map((cliente) => (
            <li key={cliente.id}>
              <button
                type="button"
                onClick={() => {
                  alCambiar(cliente);
                  setBusqueda('');
                }}
              >
                <strong>{cliente.nombre}</strong>
                <span className="mono">
                  {cliente.tipoDocumento} {cliente.numeroDocumento}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hayBusqueda && resultados.data && clientes.length === 0 && (
        <span className="campo__ayuda">No hay clientes con ese dato.</span>
      )}
      <div>
        <Boton variante="fantasma" chico onClick={alRegistrarNuevo}>
          Registrar cliente nuevo
        </Boton>
      </div>
    </div>
  );
}
