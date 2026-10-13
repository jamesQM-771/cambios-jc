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
import { formatearTelefono } from '../../lib/telefono.js';
import { useRetraso } from '../../lib/useRetraso.js';
import { useTitulo } from '../../lib/titulo.js';
import { useClientes } from '../../modulos/clientes/consultas.js';

import { DetalleCliente } from './DetalleCliente.js';
import { FormularioCliente } from './FormularioCliente.js';

/** Clientes: quienes envían dinero y quienes lo reciben. Se buscan por documento o por nombre. */
export function PaginaClientes() {
  useTitulo('Clientes');
  const notificar = useNotificar();
  const [busqueda, setBusqueda] = useState('');
  const buscado = useRetraso(busqueda);
  const [creando, setCreando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const lista = useClientes(buscado);

  const clientes = lista.data?.clientes ?? [];

  return (
    <>
      <EncabezadoPagina
        titulo="Clientes"
        descripcion="Quienes envían dinero y quienes lo reciben. Busca por documento o por nombre."
        acciones={<Boton onClick={() => setCreando(true)}>Nuevo cliente</Boton>}
      />

      <BarraHerramientas
        busqueda={{
          etiqueta: 'Buscar cliente',
          placeholder: 'Documento o nombre…',
          valor: busqueda,
          alCambiar: setBusqueda,
        }}
        {...(lista.data ? { resumen: `${String(clientes.length)} clientes` } : {})}
      />

      {lista.isPending && <Esqueleto texto="Buscando clientes…" />}
      {lista.isError && <Aviso tipo="error">{mensajeDe(lista.error)}</Aviso>}
      {lista.data && clientes.length === 0 && (
        <EstadoVacio
          titulo={buscado === '' ? 'Todavía no hay clientes' : `Sin resultados para "${buscado}"`}
          descripcion={
            buscado === ''
              ? 'Registra al primero con el botón "Nuevo cliente".'
              : 'Revisa el documento o regístralo como cliente nuevo.'
          }
          icono="usuarios"
        />
      )}
      {clientes.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">Clientes</caption>
            <thead>
              <tr>
                <th scope="col">Documento</th>
                <th scope="col">Nombre</th>
                <th scope="col">Teléfono</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((cliente) => (
                <tr key={cliente.id}>
                  <td className="mono">
                    {cliente.tipoDocumento} {cliente.numeroDocumento}
                  </td>
                  <td>{cliente.nombre}</td>
                  <td>{cliente.telefono ? formatearTelefono(cliente.telefono) : '—'}</td>
                  <td>
                    <span className={`etiqueta ${cliente.activo ? 'etiqueta--exito' : ''}`}>
                      {cliente.activo ? 'Activo' : 'Desactivado'}
                    </span>
                  </td>
                  <td>
                    <Boton
                      variante="secundario"
                      chico
                      aria-label={`Abrir ${cliente.nombre}`}
                      onClick={() => setAbierto(cliente.id)}
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

      <Dialogo abierto={creando} alCerrar={() => setCreando(false)} titulo="Nuevo cliente">
        <FormularioCliente
          alGuardar={(cliente) => {
            setCreando(false);
            notificar(`${cliente.nombre} fue registrado.`);
            setAbierto(cliente.id);
          }}
          alCancelar={() => setCreando(false)}
        />
      </Dialogo>

      <Dialogo abierto={abierto !== null} alCerrar={() => setAbierto(null)} titulo="Cliente" ancho>
        {abierto && <DetalleCliente clienteId={abierto} alCerrar={() => setAbierto(null)} />}
      </Dialogo>
    </>
  );
}
