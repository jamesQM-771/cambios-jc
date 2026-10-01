import { permisosDeRol, type Rol } from '@cambios-jc/shared';
import { vi } from 'vitest';

import type { Sesion } from '../modulos/auth/tipos.js';

export interface PeticionFalsa {
  metodo: string;
  ruta: string;
  consulta: URLSearchParams;
  cuerpo: unknown;
  formulario: FormData | null;
}

export interface RespuestaFalsa {
  estado?: number;
  cuerpo?: unknown;
}

type Manejador =
  RespuestaFalsa | ((peticion: PeticionFalsa) => RespuestaFalsa | Promise<RespuestaFalsa>);

/**
 * Reemplaza `fetch` por una API simulada. Las claves son `"MÉTODO /ruta"` (sin el prefijo `/api`).
 * Una petición que nadie simuló hace fallar la prueba: así no se llama a una ruta sin querer.
 */
export function simularApi(rutas: Record<string, Manejador>) {
  const llamadas: PeticionFalsa[] = [];
  const falso = vi.fn(async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
    const url = new URL(
      typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url,
      'http://localhost',
    );
    const metodo = (opciones?.method ?? 'GET').toUpperCase();
    const ruta = url.pathname.replace(/^\/api/, '');
    const cuerpoTexto = typeof opciones?.body === 'string' ? opciones.body : null;
    const peticion: PeticionFalsa = {
      metodo,
      ruta,
      consulta: url.searchParams,
      cuerpo: cuerpoTexto ? (JSON.parse(cuerpoTexto) as unknown) : null,
      formulario: opciones?.body instanceof FormData ? opciones.body : null,
    };
    llamadas.push(peticion);

    const manejador = rutas[`${metodo} ${ruta}`];
    if (!manejador) throw new Error(`Petición no simulada: ${metodo} ${ruta}`);
    const respuesta = typeof manejador === 'function' ? await manejador(peticion) : manejador;
    return new Response(JSON.stringify(respuesta.cuerpo ?? {}), {
      status: respuesta.estado ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', falso);

  return {
    llamadas,
    /** Las llamadas hechas a una ruta, en orden. */
    de: (metodo: string, ruta: string) =>
      llamadas.filter((llamada) => llamada.metodo === metodo && llamada.ruta === ruta),
  };
}

/** Respuesta de error con el formato de la API. */
export const errorApi = (
  estado: number,
  codigo: string,
  mensaje: string,
  detalles?: unknown,
): RespuestaFalsa => ({
  estado,
  cuerpo: { error: { codigo, mensaje, ...(detalles === undefined ? {} : { detalles }) } },
});

export const sinSesion = (): RespuestaFalsa =>
  errorApi(401, 'NO_AUTENTICADO', 'Debes iniciar sesión para continuar.');

export const sesionIncompleta = (): RespuestaFalsa =>
  errorApi(401, 'SESION_INCOMPLETA', 'Debes completar la verificación en dos pasos.');

/** Una sesión completa de un usuario con ese rol, con los permisos reales que le da el sistema. */
export function sesionFalsa(rol: Rol, cambios: Partial<Sesion> = {}): Sesion {
  return {
    usuario: { id: `id-${rol}`, nombre: `Persona ${rol}`, login: rol, rol },
    permisos: [...permisosDeRol(rol)],
    empresa: {
      nombre: 'Casa de Cambio Ejemplo',
      nit: null,
      telefono: null,
      whatsapp: null,
      direccion: null,
      logoUrl: null,
      monedaLocal: 'COP',
      zonaHoraria: 'America/Bogota',
      textoPieRecibo: null,
    },
    ...cambios,
  };
}
