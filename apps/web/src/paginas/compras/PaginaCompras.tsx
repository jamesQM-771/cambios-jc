import { formatearMoneda, type Moneda } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { CampoAreaTexto } from '../../componentes/CampoAreaTexto.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import { EncabezadoPagina, EstadoVacio, Esqueleto } from '../../componentes/Pagina.js';
import { MENSAJE_PENDIENTE, quedoPendiente } from '../../lib/aprobacion.js';
import { mensajeDe } from '../../lib/api.js';
import { formatearFechaHora, formatearTasa } from '../../lib/formato.js';
import { useTitulo } from '../../lib/titulo.js';
import { useSesionActual } from '../../modulos/auth/ContextoSesion.js';
import { anularCompra } from '../../modulos/compras/api.js';
import { CLAVE_COMPRAS, useCompras, useOpcionesCompra } from '../../modulos/compras/consultas.js';
import type { Compra } from '../../modulos/compras/tipos.js';
import { CLAVE_CONTRAPARTES } from '../../modulos/contrapartes/consultas.js';
import { CLAVE_INVENTARIO } from '../../modulos/inventario/consultas.js';

import { FormularioCompra } from './FormularioCompra.js';

/** Compras de bolívares a contrapartes: alimentan el inventario y su costo promedio (§5.6). */
export function PaginaCompras() {
  useTitulo('Compras');
  const notificar = useNotificar();
  const consultas = useQueryClient();
  const { empresa } = useSesionActual();
  const zona = empresa?.zonaHoraria ?? 'America/Bogota';
  const [creando, setCreando] = useState(false);
  const [anulando, setAnulando] = useState<Compra | null>(null);
  const [motivo, setMotivo] = useState('');
  const lista = useCompras();
  const opciones = useOpcionesCompra(creando);
  const compras = lista.data?.compras ?? [];

  const anular = useMutation({
    mutationFn: () => {
      if (!anulando) throw new Error('Elige una compra.');
      return anularCompra(anulando.id, motivo.trim());
    },
    onSuccess: async (respuesta) => {
      setAnulando(null);
      setMotivo('');
      notificar(quedoPendiente(respuesta) ? MENSAJE_PENDIENTE : 'Compra anulada.');
      await Promise.all([
        consultas.invalidateQueries({ queryKey: CLAVE_COMPRAS }),
        consultas.invalidateQueries({ queryKey: CLAVE_CONTRAPARTES }),
        consultas.invalidateQueries({ queryKey: CLAVE_INVENTARIO }),
      ]);
    },
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Compras"
        descripcion="Bolívares comprados a proveedores, de contado o a crédito. Cada compra actualiza el costo promedio con que se calcula la ganancia."
        acciones={<Boton onClick={() => setCreando(true)}>Nueva compra</Boton>}
      />

      {lista.isPending && <Esqueleto texto="Cargando las compras…" />}
      {lista.isError && <Aviso tipo="error">{mensajeDe(lista.error)}</Aviso>}
      {lista.data && compras.length === 0 && (
        <EstadoVacio
          titulo="Todavía no hay compras"
          descripcion='Registra la primera con el botón "Nueva compra".'
          icono="flecha"
        />
      )}
      {compras.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">Compras</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Contraparte</th>
                <th scope="col" className="tabla__numero">
                  Cantidad
                </th>
                <th scope="col" className="tabla__numero">
                  Tasa
                </th>
                <th scope="col" className="tabla__numero">
                  Pesos
                </th>
                <th scope="col">Pago</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {compras.map((compra) => (
                <tr key={compra.id}>
                  <td>{formatearFechaHora(compra.creadoEn, zona)}</td>
                  <td>
                    {compra.contraparte.nombre}
                    <small>A {compra.cuentaDestino.nombre}</small>
                  </td>
                  <td className="tabla__numero mono">
                    {formatearMoneda(compra.cantidad, compra.moneda as Moneda)}
                  </td>
                  <td className="tabla__numero mono">{formatearTasa(compra.tasa)}</td>
                  <td className="tabla__numero mono">
                    {formatearMoneda(compra.montoPesos, 'COP')}
                  </td>
                  <td>
                    {compra.formaPago === 'contado'
                      ? `De contado (${compra.cuentaPago?.nombre ?? ''})`
                      : 'A crédito'}
                  </td>
                  <td>
                    {compra.anulado ? (
                      <>
                        Anulada
                        <small>{compra.anulado.motivo}</small>
                      </>
                    ) : (
                      'Vigente'
                    )}
                  </td>
                  <td>
                    {!compra.anulado && (
                      <Boton
                        variante="secundario"
                        chico
                        aria-label={`Anular la compra a ${compra.contraparte.nombre}`}
                        onClick={() => setAnulando(compra)}
                      >
                        Anular
                      </Boton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialogo abierto={creando} alCerrar={() => setCreando(false)} titulo="Nueva compra">
        {creando && opciones.isPending && <Esqueleto texto="Cargando el formulario…" />}
        {creando && opciones.isError && <Aviso tipo="error">{mensajeDe(opciones.error)}</Aviso>}
        {creando && opciones.data && (
          <FormularioCompra
            opciones={opciones.data}
            alCancelar={() => setCreando(false)}
            alRegistrar={() => {
              setCreando(false);
              notificar('Compra registrada.');
            }}
          />
        )}
      </Dialogo>

      <Dialogo
        abierto={anulando !== null}
        alCerrar={() => setAnulando(null)}
        titulo="Anular la compra"
      >
        {anulando && (
          <>
            <p>
              Salen{' '}
              <strong className="mono">
                {formatearMoneda(anulando.cantidad, anulando.moneda as Moneda)}
              </strong>{' '}
              de <strong>{anulando.cuentaDestino.nombre}</strong>,{' '}
              {anulando.formaPago === 'contado'
                ? `vuelven los pesos a ${anulando.cuentaPago?.nombre ?? 'su cuenta'}`
                : 'se anula la deuda con la contraparte'}{' '}
              y el inventario deshace la compra. Nada se borra.
            </p>
            {anular.isError && <Aviso tipo="error">{mensajeDe(anular.error)}</Aviso>}
            <CampoAreaTexto
              etiqueta="Motivo"
              rows={3}
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
            />
            <div className="acciones acciones--derecha">
              <Boton variante="secundario" onClick={() => setAnulando(null)}>
                Volver
              </Boton>
              <Boton
                variante="peligro"
                cargando={anular.isPending}
                disabled={motivo.trim().length < 3}
                onClick={() => anular.mutate()}
              >
                Anular compra
              </Boton>
            </div>
          </>
        )}
      </Dialogo>
    </>
  );
}
