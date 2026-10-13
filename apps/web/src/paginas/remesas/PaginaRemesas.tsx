import { formatearMoneda } from '@cambios-jc/shared';
import { useState } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import { useNotificar } from '../../componentes/Notificaciones.js';
import {
  BarraHerramientas,
  EncabezadoPagina,
  EstadoVacio,
  Esqueleto,
} from '../../componentes/Pagina.js';
import { mensajeDe } from '../../lib/api.js';
import { formatearFechaHora } from '../../lib/formato.js';
import { useTitulo } from '../../lib/titulo.js';
import { useSesionActual } from '../../modulos/auth/ContextoSesion.js';
import { useOpcionesRemesa, useRemesas } from '../../modulos/remesas/consultas.js';
import {
  ESTADOS_REMESA,
  ETIQUETAS_ESTADO,
  type EstadoRemesa,
  type Remesa,
} from '../../modulos/remesas/tipos.js';

import { DetalleRemesa } from './DetalleRemesa.js';
import { DialogoRecibo } from './DialogoRecibo.js';
import { EtiquetaEstado } from './EtiquetaEstado.js';
import { FormularioRemesa } from './FormularioRemesa.js';

/** Remesas del local: registrar una nueva, seguir su estado y atender lo que pide acción. */
export function PaginaRemesas() {
  useTitulo('Remesas');
  const notificar = useNotificar();
  const { permisos, empresa } = useSesionActual();
  const zona = empresa?.zonaHoraria ?? 'America/Bogota';
  const [estado, setEstado] = useState<EstadoRemesa | ''>('');
  const [creando, setCreando] = useState(false);
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const [reciboDe, setReciboDe] = useState<Remesa | null>(null);

  const lista = useRemesas(estado === '' ? undefined : estado);
  const opciones = useOpcionesRemesa(creando);
  const remesas = lista.data?.remesas ?? [];
  // La remesa abierta se lee de la lista: así el detalle se actualiza solo cuando algo cambia.
  const abierta = remesas.find((r) => r.id === abiertaId) ?? null;

  const puedeRegistrar = permisos.includes('remesa.registrar');

  return (
    <>
      <EncabezadoPagina
        titulo="Remesas"
        descripcion="Envíos a Venezuela: regístralos, verifica el pago y sigue cada uno hasta que se paga."
        acciones={
          puedeRegistrar ? <Boton onClick={() => setCreando(true)}>Nueva remesa</Boton> : undefined
        }
      />

      <BarraHerramientas {...(lista.data ? { resumen: `${String(remesas.length)} remesas` } : {})}>
        <div className="campo">
          <label className="campo__etiqueta" htmlFor="filtro-estado">
            Estado
          </label>
          <select
            id="filtro-estado"
            className="campo__entrada"
            value={estado}
            onChange={(evento) => setEstado(evento.target.value as EstadoRemesa | '')}
          >
            <option value="">Todos</option>
            {ESTADOS_REMESA.map((valor) => (
              <option key={valor} value={valor}>
                {ETIQUETAS_ESTADO[valor]}
              </option>
            ))}
          </select>
        </div>
      </BarraHerramientas>

      {lista.isPending && <Esqueleto texto="Cargando las remesas…" />}
      {lista.isError && <Aviso tipo="error">{mensajeDe(lista.error)}</Aviso>}
      {lista.data && remesas.length === 0 && (
        <EstadoVacio
          titulo={estado === '' ? 'Todavía no hay remesas' : 'No hay remesas en ese estado'}
          descripcion={
            estado === '' ? 'Registra la primera con el botón "Nueva remesa".' : undefined
          }
          icono="flecha"
        />
      )}
      {remesas.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">Remesas</caption>
            <thead>
              <tr>
                <th scope="col">N°</th>
                <th scope="col">Fecha</th>
                <th scope="col">Remitente</th>
                <th scope="col">Beneficiario</th>
                <th scope="col" className="tabla__numero">
                  Pesos
                </th>
                <th scope="col" className="tabla__numero">
                  Bolívares
                </th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {remesas.map((remesa) => (
                <tr key={remesa.id}>
                  <td className="mono">{remesa.numeroComprobante}</td>
                  <td>{formatearFechaHora(remesa.creadoEn, zona)}</td>
                  <td>{remesa.remitente.nombre}</td>
                  <td>
                    {remesa.beneficiario.titular}
                    <small>{remesa.beneficiario.banco.nombre}</small>
                  </td>
                  <td className="tabla__numero mono">
                    {formatearMoneda(remesa.montoPesos, 'COP')}
                  </td>
                  <td className="tabla__numero mono">
                    {formatearMoneda(remesa.montoBolivares, 'VES')}
                  </td>
                  <td>
                    <EtiquetaEstado estado={remesa.estado} />
                  </td>
                  <td>
                    <Boton
                      variante="secundario"
                      chico
                      aria-label={`Abrir remesa ${String(remesa.numeroComprobante)}`}
                      onClick={() => setAbiertaId(remesa.id)}
                    >
                      Abrir
                    </Boton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialogo abierto={creando} alCerrar={() => setCreando(false)} titulo="Nueva remesa" ancho>
        {creando && opciones.isPending && <Esqueleto texto="Cargando el formulario…" />}
        {creando && opciones.isError && <Aviso tipo="error">{mensajeDe(opciones.error)}</Aviso>}
        {creando && opciones.data && (
          <FormularioRemesa
            opciones={opciones.data}
            puedeCambiarTasa={permisos.includes('tasa.cambiar_en_operacion')}
            alCancelar={() => setCreando(false)}
            alRegistrar={(remesa) => {
              setCreando(false);
              notificar(`Remesa ${String(remesa.numeroComprobante)} registrada.`);
              setReciboDe(remesa);
            }}
          />
        )}
      </Dialogo>

      <Dialogo abierto={abierta !== null} alCerrar={() => setAbiertaId(null)} titulo="Remesa" ancho>
        {abierta && <DetalleRemesa remesa={abierta} alCerrar={() => setAbiertaId(null)} />}
      </Dialogo>

      <DialogoRecibo remesa={reciboDe} alCerrar={() => setReciboDe(null)} />
    </>
  );
}
