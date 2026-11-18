import { formatearMoneda, type Moneda } from '@cambios-jc/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { CampoAreaTexto } from '../../componentes/CampoAreaTexto.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import { EncabezadoPagina, EstadoVacio, Esqueleto } from '../../componentes/Pagina.js';
import { mensajeDe } from '../../lib/api.js';
import { formatearFechaHora, formatearTasa } from '../../lib/formato.js';
import { useTitulo } from '../../lib/titulo.js';
import { useSesionActual } from '../../modulos/auth/ContextoSesion.js';
import { anularDivisa, imprimirDivisa } from '../../modulos/divisas/api.js';
import { CLAVE_DIVISAS, useDivisas, useOpcionesDivisa } from '../../modulos/divisas/consultas.js';
import type { OperacionDivisa, ReciboDivisa } from '../../modulos/divisas/tipos.js';

import { FormularioDivisa } from './FormularioDivisa.js';

const dinero = (valor: string, moneda: string) => formatearMoneda(valor, moneda as Moneda);

/** Divisas en caja: compra y venta de dólares en efectivo, con recibo (§5.7). */
export function PaginaDivisas() {
  useTitulo('Divisas');
  const notificar = useNotificar();
  const consultas = useQueryClient();
  const { permisos, empresa } = useSesionActual();
  const zona = empresa?.zonaHoraria ?? 'America/Bogota';
  const puedeAnular = permisos.includes('divisa_caja.anular');
  const [creando, setCreando] = useState(false);
  const [anulando, setAnulando] = useState<OperacionDivisa | null>(null);
  const [motivo, setMotivo] = useState('');
  const [recibo, setRecibo] = useState<ReciboDivisa | null>(null);
  const lista = useDivisas();
  const opciones = useOpcionesDivisa(creando);
  const operaciones = lista.data?.operaciones ?? [];

  const imprimir = useMutation({
    mutationFn: (id: string) => imprimirDivisa(id),
    onSuccess: ({ recibo: nuevo }) => {
      setRecibo(nuevo);
      setTimeout(() => window.print(), 100);
    },
  });

  const anular = useMutation({
    mutationFn: () => {
      if (!anulando) throw new Error('Elige una operación.');
      return anularDivisa(anulando.id, motivo.trim());
    },
    onSuccess: async () => {
      setAnulando(null);
      setMotivo('');
      notificar('Operación anulada: el dinero volvió a la caja.');
      await consultas.invalidateQueries({ queryKey: CLAVE_DIVISAS });
    },
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Divisas"
        descripcion="Compra y venta de dólares en efectivo. Cuenta los billetes: el efectivo entra y sale de la caja de tu turno."
        acciones={<Boton onClick={() => setCreando(true)}>Nueva operación</Boton>}
      />

      {lista.isPending && <Esqueleto texto="Cargando las operaciones…" />}
      {lista.isError && <Aviso tipo="error">{mensajeDe(lista.error)}</Aviso>}
      {imprimir.isError && <Aviso tipo="error">{mensajeDe(imprimir.error)}</Aviso>}
      {lista.data && operaciones.length === 0 && (
        <EstadoVacio
          titulo="Todavía no hay operaciones"
          descripcion='Registra la primera con "Nueva operación".'
          icono="flecha"
        />
      )}
      {operaciones.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">Operaciones de divisas</caption>
            <thead>
              <tr>
                <th scope="col">N°</th>
                <th scope="col">Fecha</th>
                <th scope="col">Operación</th>
                <th scope="col" className="tabla__numero">
                  Divisa
                </th>
                <th scope="col" className="tabla__numero">
                  Tasa
                </th>
                <th scope="col" className="tabla__numero">
                  Pesos
                </th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {operaciones.map((op) => (
                <tr key={op.id}>
                  <td className="mono">{op.numeroComprobante}</td>
                  <td>
                    {formatearFechaHora(op.creadoEn, zona)}
                    <small>{op.creadoPor.nombre}</small>
                  </td>
                  <td>
                    {op.tipo === 'compra' ? 'Compra' : 'Venta'}
                    {op.clienteNombre && <small>{op.clienteNombre}</small>}
                    {op.ganancia && <small>Ganancia {dinero(op.ganancia.ganancia, 'COP')}</small>}
                  </td>
                  <td className="tabla__numero mono">{dinero(op.montoDivisa, op.moneda)}</td>
                  <td className="tabla__numero mono">{formatearTasa(op.tasaUsada)}</td>
                  <td className="tabla__numero mono">{dinero(op.montoPesos, 'COP')}</td>
                  <td>
                    {op.anulado ? (
                      <>
                        Anulada
                        <small>{op.anulado.motivo}</small>
                      </>
                    ) : (
                      'Vigente'
                    )}
                  </td>
                  <td>
                    <div className="acciones">
                      <Boton
                        variante="secundario"
                        chico
                        aria-label={`Recibo de la operación ${String(op.numeroComprobante)}`}
                        cargando={imprimir.isPending && imprimir.variables === op.id}
                        onClick={() => imprimir.mutate(op.id)}
                      >
                        Recibo
                      </Boton>
                      {puedeAnular && !op.anulado && (
                        <Boton
                          variante="secundario"
                          chico
                          aria-label={`Anular la operación ${String(op.numeroComprobante)}`}
                          onClick={() => setAnulando(op)}
                        >
                          Anular
                        </Boton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialogo abierto={creando} alCerrar={() => setCreando(false)} titulo="Nueva operación">
        {creando && opciones.isPending && <Esqueleto texto="Cargando el formulario…" />}
        {creando && opciones.isError && <Aviso tipo="error">{mensajeDe(opciones.error)}</Aviso>}
        {creando && opciones.data && (
          <FormularioDivisa
            opciones={opciones.data}
            alCancelar={() => setCreando(false)}
            alRegistrar={(operacion) => {
              setCreando(false);
              notificar(operacion.tipo === 'compra' ? 'Compra registrada.' : 'Venta registrada.');
              imprimir.mutate(operacion.id);
            }}
          />
        )}
      </Dialogo>

      <Dialogo abierto={recibo !== null} alCerrar={() => setRecibo(null)} titulo="Recibo">
        {recibo && (
          <>
            <TicketDivisa recibo={recibo} />
            <div className="acciones acciones--derecha">
              <Boton variante="secundario" onClick={() => setRecibo(null)}>
                Cerrar
              </Boton>
              <Boton onClick={() => window.print()}>Imprimir</Boton>
            </div>
          </>
        )}
      </Dialogo>

      <Dialogo
        abierto={anulando !== null}
        alCerrar={() => setAnulando(null)}
        titulo="Anular la operación"
      >
        {anulando && (
          <>
            <p>
              El efectivo vuelve a la caja ({dinero(anulando.montoDivisa, anulando.moneda)} y{' '}
              {dinero(anulando.montoPesos, 'COP')}) y el inventario se deshace. Nada se borra.
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
                Anular operación
              </Boton>
            </div>
          </>
        )}
      </Dialogo>
    </>
  );
}

/** Ticket de una compra o venta de divisas: lo que se ve es lo que sale por la impresora. */
function TicketDivisa({ recibo }: { recibo: ReciboDivisa }) {
  const { operacion: op, empresa } = recibo;
  const filas: [string, string][] = [
    ['Comprobante N°', String(op.numeroComprobante)],
    ['Fecha', formatearFechaHora(op.creadoEn, empresa.zonaHoraria)],
    ['Operación', op.tipo === 'compra' ? 'Compra de divisa' : 'Venta de divisa'],
    ...(op.clienteNombre
      ? [
          [
            'Cliente',
            `${op.clienteNombre}${op.clienteDocumento ? ` (${op.clienteDocumento})` : ''}`,
          ] as [string, string],
        ]
      : []),
    [op.tipo === 'compra' ? 'Recibido' : 'Entregado', dinero(op.montoDivisa, op.moneda)],
    ['Tasa', formatearTasa(op.tasaUsada)],
    [op.tipo === 'compra' ? 'Pagado' : 'Cobrado', dinero(op.montoPesos, 'COP')],
    ['Atendió', op.creadoPor.nombre],
  ];
  return (
    <article
      className="recibo recibo--80"
      aria-label={`Recibo ${String(op.numeroComprobante)}${recibo.esCopia ? ' (copia)' : ''}`}
    >
      {recibo.esCopia && <p className="recibo__copia">COPIA</p>}
      {op.anulado && <p className="recibo__copia">ANULADA</p>}
      <header className="recibo__cabecera">
        <h2 className="recibo__empresa">{empresa.nombre}</h2>
        {empresa.nit && <p>NIT {empresa.nit}</p>}
        {empresa.whatsapp && <p>WhatsApp {empresa.whatsapp}</p>}
      </header>
      <dl className="recibo__datos">
        {filas.map(([titulo, valor]) => (
          <div key={titulo} className="recibo__fila">
            <dt>{titulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
      {empresa.textoPie && <p className="recibo__pie">{empresa.textoPie}</p>}
    </article>
  );
}
