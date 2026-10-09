import type { ReactNode } from 'react';

import { Boton } from './Boton.js';

export interface ColumnaCatalogo<T> {
  encabezado: string;
  render: (item: T) => ReactNode;
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
}

/**
 * Tabla de un catálogo simple (bancos, sucursales, cajas, denominaciones, líneas de negocio…):
 * columnas propias de cada entidad más una etiqueta de estado y dos acciones (Editar y
 * Desactivar/Reactivar). Evita repetir la misma estructura en cada pantalla de configuración.
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
}: PropiedadesTablaCatalogo<T>) {
  return (
    <div className="tabla-contenedor">
      <table className="tabla">
        <caption className="solo-lectores">{tituloLista}</caption>
        <thead>
          <tr>
            {columnas.map((columna) => (
              <th scope="col" key={columna.encabezado}>
                {columna.encabezado}
              </th>
            ))}
            <th scope="col">Estado</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const activa = activaDe(item);
            const nombre = nombreDe(item);
            return (
              <tr key={idDe(item)}>
                {columnas.map((columna) => (
                  <td key={columna.encabezado}>{columna.render(item)}</td>
                ))}
                <td>
                  {activa ? (
                    <span className="etiqueta etiqueta--exito">Activo</span>
                  ) : (
                    <span className="etiqueta etiqueta--error">Inactivo</span>
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
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {items.length === 0 && <p>No hay registros todavía.</p>}
    </div>
  );
}
