import { useState, type ReactNode } from 'react';

import { Boton } from './Boton.js';
import { MenuAcciones, type AccionMenu } from './MenuAcciones.js';
import { BarraHerramientas, EstadoVacio } from './Pagina.js';

export interface ColumnaCatalogo<T> {
  encabezado: string;
  render: (item: T) => ReactNode;
  /** Columna de cifras: a la derecha y en monoespaciada. */
  numerica?: boolean;
}

interface PropiedadesTablaCatalogo<T> {
  /** Para el `<caption>` (solo lectores de pantalla) y los `aria-label` de los botones. */
  tituloLista: string;
  items: readonly T[];
  columnas: readonly ColumnaCatalogo<T>[];
  idDe: (item: T) => string;
  nombreDe: (item: T) => string;
  activaDe: (item: T) => boolean;
  alEditar: (item: T) => void;
  alDesactivar: (item: T) => void;
  alReactivar: (item: T) => void;
  /** Texto de cada registro en el que se busca. Si se indica, aparece el buscador. */
  buscarEn?: (item: T) => string;
  /** Nombre en plural y minúsculas para el conteo: "bancos", "cuentas". */
  nombrePlural?: string;
  /** Filtros propios de la pantalla (casillas, selectores), junto al buscador. */
  filtros?: ReactNode;
  /** Acciones menos frecuentes de una fila; van en el menú "Más acciones". */
  accionesExtra?: (item: T) => readonly AccionMenu[];
}

/** Sin tildes ni mayúsculas: "Crédito" se encuentra escribiendo "credito". */
const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Tabla de un catálogo (bancos, sucursales, cajas, denominaciones, líneas de negocio, cuentas):
 * buscador, filtros, conteo, columnas propias de cada entidad, estado y acciones. Las dos acciones
 * de siempre (Editar y Desactivar/Reactivar) quedan a la vista; las demás, en un menú.
 */
export function TablaCatalogo<T>({
  tituloLista,
  items,
  columnas,
  idDe,
  nombreDe,
  activaDe,
  alEditar,
  alDesactivar,
  alReactivar,
  buscarEn,
  nombrePlural = 'registros',
  filtros,
  accionesExtra,
}: PropiedadesTablaCatalogo<T>) {
  const [busqueda, setBusqueda] = useState('');
  const buscado = normalizar(busqueda.trim());
  const visibles =
    buscarEn && buscado !== ''
      ? items.filter((item) => normalizar(buscarEn(item)).includes(buscado))
      : items;
  const resumen =
    visibles.length === items.length
      ? `${String(items.length)} ${nombrePlural}`
      : `${String(visibles.length)} de ${String(items.length)} ${nombrePlural}`;

  return (
    <>
      {(buscarEn ?? filtros) && (
        <BarraHerramientas
          {...(buscarEn
            ? {
                busqueda: {
                  etiqueta: `Buscar en ${tituloLista.toLowerCase()}`,
                  placeholder: 'Buscar…',
                  valor: busqueda,
                  alCambiar: setBusqueda,
                },
              }
            : {})}
          resumen={resumen}
        >
          {filtros}
        </BarraHerramientas>
      )}
      <div className="tabla-contenedor">
        <table className="tabla">
          <caption className="solo-lectores">{tituloLista}</caption>
          <thead>
            <tr>
              {columnas.map((columna) => (
                <th
                  scope="col"
                  key={columna.encabezado}
                  className={columna.numerica ? 'tabla__numero' : undefined}
                >
                  {columna.encabezado}
                </th>
              ))}
              <th scope="col">Estado</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((item) => {
              const activa = activaDe(item);
              const nombre = nombreDe(item);
              const extras = accionesExtra?.(item) ?? [];
              return (
                <tr key={idDe(item)}>
                  {columnas.map((columna) => (
                    <td
                      key={columna.encabezado}
                      className={columna.numerica ? 'tabla__numero mono' : undefined}
                    >
                      {columna.render(item)}
                    </td>
                  ))}
                  <td>
                    {activa ? (
                      <span className="etiqueta etiqueta--exito">Activo</span>
                    ) : (
                      <span className="etiqueta">Inactivo</span>
                    )}
                  </td>
                  <td>
                    <div className="tabla__acciones">
                      <Boton
                        variante="secundario"
                        chico
                        aria-label={`Editar ${nombre}`}
                        onClick={() => alEditar(item)}
                      >
                        Editar
                      </Boton>
                      {activa ? (
                        <Boton
                          variante="peligro"
                          chico
                          aria-label={`Desactivar ${nombre}`}
                          onClick={() => alDesactivar(item)}
                        >
                          Desactivar
                        </Boton>
                      ) : (
                        <Boton
                          variante="secundario"
                          chico
                          aria-label={`Reactivar ${nombre}`}
                          onClick={() => alReactivar(item)}
                        >
                          Reactivar
                        </Boton>
                      )}
                      {extras.length > 0 && (
                        <MenuAcciones etiqueta={`Más acciones de ${nombre}`} acciones={extras} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 && (
          <EstadoVacio
            titulo="No hay registros todavía."
            descripcion="Cuando crees el primero aparecerá aquí."
          />
        )}
        {items.length > 0 && visibles.length === 0 && (
          <EstadoVacio
            icono="buscar"
            titulo="Sin resultados"
            descripcion={`Nada coincide con “${busqueda.trim()}”. Revisa cómo está escrito o prueba con menos letras.`}
            accion={
              <Boton
                variante="secundario"
                chico
                onClick={() => {
                  setBusqueda('');
                }}
              >
                Limpiar búsqueda
              </Boton>
            }
          />
        )}
      </div>
    </>
  );
}
