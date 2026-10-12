import { useId, type ReactNode } from 'react';

import { Icono, type NombreIcono } from './Icono.js';

interface PropiedadesEncabezadoPagina {
  titulo: string;
  descripcion?: ReactNode;
  /** 1 para el título de la pantalla; 2 para una sección dentro de otra (pestañas de Configuración). */
  nivel?: 1 | 2;
  /** Acción principal de la pantalla ("Nuevo banco"). Una sola por pantalla. */
  acciones?: ReactNode;
}

/** Título, descripción y acción principal: siempre en el mismo lugar en todas las pantallas. */
export function EncabezadoPagina({
  titulo,
  descripcion,
  nivel = 1,
  acciones,
}: PropiedadesEncabezadoPagina) {
  const Titulo = nivel === 1 ? 'h1' : 'h2';
  return (
    <div className="cabecera-pagina cabecera-pagina--acciones">
      <div>
        <Titulo>{titulo}</Titulo>
        {descripcion && <p>{descripcion}</p>}
      </div>
      {acciones && <div className="acciones">{acciones}</div>}
    </div>
  );
}

interface PropiedadesBarraHerramientas {
  busqueda?: {
    etiqueta: string;
    valor: string;
    alCambiar: (valor: string) => void;
    placeholder?: string;
  };
  /** Filtros adicionales (selectores, casillas). */
  children?: ReactNode;
  /** Cuántos registros se están viendo: "12 de 27 bancos". */
  resumen?: string;
}

/** Búsqueda, filtros y conteo encima de una tabla. */
export function BarraHerramientas({ busqueda, children, resumen }: PropiedadesBarraHerramientas) {
  const id = useId();
  return (
    <div className="barra-herramientas">
      {busqueda && (
        <div className="barra-herramientas__busqueda">
          <label className="solo-lectores" htmlFor={id}>
            {busqueda.etiqueta}
          </label>
          <Icono nombre="buscar" />
          <input
            id={id}
            type="search"
            className="campo__entrada"
            placeholder={busqueda.placeholder ?? busqueda.etiqueta}
            value={busqueda.valor}
            onChange={(evento) => {
              busqueda.alCambiar(evento.target.value);
            }}
          />
        </div>
      )}
      {children}
      {resumen && (
        <p className="barra-herramientas__resumen" role="status">
          {resumen}
        </p>
      )}
    </div>
  );
}

interface PropiedadesSeccionFormulario {
  titulo: string;
  descripcion?: ReactNode;
  children: ReactNode;
}

/** Grupo de campos relacionados, con su título y una explicación corta al lado. */
export function SeccionFormulario({ titulo, descripcion, children }: PropiedadesSeccionFormulario) {
  return (
    <fieldset className="seccion-formulario">
      <legend className="seccion-formulario__titulo">{titulo}</legend>
      {descripcion && <p className="seccion-formulario__descripcion">{descripcion}</p>}
      <div className="seccion-formulario__campos">{children}</div>
    </fieldset>
  );
}

interface PropiedadesEstadoVacio {
  titulo: string;
  descripcion?: ReactNode;
  icono?: NombreIcono;
  /** Qué hacer ahora: crear el primero, o limpiar la búsqueda. */
  accion?: ReactNode;
}

/** Lo que se ve cuando no hay nada que listar, con el siguiente paso a la mano. */
export function EstadoVacio({
  titulo,
  descripcion,
  icono = 'info',
  accion,
}: PropiedadesEstadoVacio) {
  return (
    <div className="estado-vacio">
      <span className="estado-vacio__icono">
        <Icono nombre={icono} grande />
      </span>
      <p className="estado-vacio__titulo">{titulo}</p>
      {descripcion && <p className="estado-vacio__descripcion">{descripcion}</p>}
      {accion}
    </div>
  );
}

/** Carga con la forma de lo que viene (filas de una tabla), en vez de una rueda en blanco. */
export function Esqueleto({ filas = 5, texto = 'Cargando…' }: { filas?: number; texto?: string }) {
  return (
    <div className="esqueleto" role="status">
      <span className="solo-lectores">{texto}</span>
      {Array.from({ length: filas }, (_, indice) => (
        <span key={indice} className="esqueleto__fila" aria-hidden="true" />
      ))}
    </div>
  );
}
