import { useState } from 'react';

import { Aviso } from '../../componentes/Aviso.js';
import { Boton } from '../../componentes/Boton.js';
import { Dialogo } from '../../componentes/Dialogo.js';
import {
  BarraHerramientas,
  EncabezadoPagina,
  EstadoVacio,
  Esqueleto,
} from '../../componentes/Pagina.js';
import { mensajeDe } from '../../lib/api.js';
import { useTitulo } from '../../lib/titulo.js';
import { useJornadas } from '../../modulos/jornadas/consultas.js';
import type { EstadoJornada } from '../../modulos/jornadas/tipos.js';

import { DetalleJornada } from './DetalleJornada.js';

/** Jornada: el cierre del día de la sucursal, con el arqueo de cuentas y el resumen (§5.16). */
export function PaginaJornada() {
  useTitulo('Jornada');
  const [estado, setEstado] = useState<EstadoJornada | ''>('');
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const lista = useJornadas(estado === '' ? undefined : estado);
  const jornadas = lista.data?.jornadas ?? [];

  return (
    <>
      <EncabezadoPagina
        titulo="Jornada"
        descripcion="Cierra el día: revisa los turnos, cuenta la bóveda, los bancos y las billeteras, y mira el resumen. Una jornada se abre sola con el primer turno."
      />

      <BarraHerramientas
        {...(lista.data ? { resumen: `${String(jornadas.length)} jornadas` } : {})}
      >
        <div className="campo">
          <label className="campo__etiqueta" htmlFor="filtro-estado-jornada">
            Estado
          </label>
          <select
            id="filtro-estado-jornada"
            className="campo__entrada"
            value={estado}
            onChange={(evento) => setEstado(evento.target.value as EstadoJornada | '')}
          >
            <option value="">Todas</option>
            <option value="abierta">Abiertas</option>
            <option value="cerrada">Cerradas</option>
          </select>
        </div>
      </BarraHerramientas>

      {lista.isPending && <Esqueleto texto="Cargando las jornadas…" />}
      {lista.isError && <Aviso tipo="error">{mensajeDe(lista.error)}</Aviso>}
      {lista.data && jornadas.length === 0 && (
        <EstadoVacio
          titulo={estado === '' ? 'Todavía no hay jornadas' : 'No hay jornadas en ese estado'}
          descripcion={
            estado === '' ? 'La primera se abre cuando un vendedor abre su turno.' : undefined
          }
          icono="panel"
        />
      )}
      {jornadas.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">Jornadas</caption>
            <thead>
              <tr>
                <th scope="col">Día</th>
                <th scope="col">Sucursal</th>
                <th scope="col">Estado</th>
                <th scope="col" className="tabla__numero">
                  Turnos abiertos
                </th>
                <th scope="col">
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {jornadas.map((jornada) => (
                <tr key={jornada.id}>
                  <td className="mono">{jornada.fecha}</td>
                  <td>{jornada.sucursal.nombre}</td>
                  <td>{jornada.estado === 'abierta' ? 'Abierta' : 'Cerrada'}</td>
                  <td className="tabla__numero">{jornada.turnosAbiertos}</td>
                  <td>
                    <Boton
                      variante="secundario"
                      chico
                      aria-label={`Abrir la jornada del ${jornada.fecha}`}
                      onClick={() => setAbiertaId(jornada.id)}
                    >
                      {jornada.estado === 'abierta' ? 'Cerrar o revisar' : 'Ver'}
                    </Boton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialogo
        abierto={abiertaId !== null}
        alCerrar={() => setAbiertaId(null)}
        titulo="Jornada"
        ancho
      >
        {abiertaId && <DetalleJornada id={abiertaId} />}
      </Dialogo>
    </>
  );
}
