import { randomBytes } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Tamaño máximo de un archivo subido: 1 MB (FASE-0 §0.9). */
export const MAXIMO_SUBIDA_BYTES = 1_048_576;

/**
 * Dónde queda guardado un logo, relativo a la carpeta de subidas. El nombre lo genera el servidor
 * (nunca viene de quien sube el archivo), así que no hay forma de escribir fuera de la carpeta.
 */
const PATRON_CLAVE_LOGO = /^empresa\/logo-([0-9a-f]{32})\.(png|jpg)$/;

/** Reconoce una clave de logo válida y devuelve su parte aleatoria (sirve para versionar la URL). */
export function versionDeClaveLogo(clave: string | null): string | null {
  return clave ? (PATRON_CLAVE_LOGO.exec(clave)?.[1] ?? null) : null;
}

/** Dónde queda guardada la captura de un comprobante de pago (la clave la genera el servidor). */
const PATRON_CLAVE_COMPROBANTE = /^comprobantes\/([0-9a-f]{32})\.(png|jpg)$/;

export interface ComprobanteAbierto {
  flujo: ReadStream;
  tamano: number;
  mime: 'image/png' | 'image/jpeg';
}

export interface LogoAbierto {
  flujo: ReadStream;
  tamano: number;
}

export interface Almacenamiento {
  /** Guarda el logo y devuelve su clave. Escribe a un archivo temporal y lo renombra: nunca queda a medias. */
  guardarLogo(contenido: Buffer, extension: 'png' | 'jpg'): Promise<string>;
  /** Abre un logo ya guardado, o `null` si la clave no es válida o el archivo no existe. */
  abrirLogo(clave: string): Promise<LogoAbierto | null>;
  /** Quita un archivo recién guardado cuando falló lo que venía después (no se usa para logos anteriores). */
  descartarLogo(clave: string): Promise<void>;
  /** Guarda la captura de un comprobante de pago y devuelve su clave. */
  guardarComprobante(contenido: Buffer, extension: 'png' | 'jpg'): Promise<string>;
  /** Abre una captura ya guardada, o `null` si la clave no es válida o el archivo no existe. */
  abrirComprobante(clave: string): Promise<ComprobanteAbierto | null>;
  /** Quita una captura recién guardada cuando falló lo que venía después. */
  descartarComprobante(clave: string): Promise<void>;
}

/**
 * Almacenamiento en una carpeta local (`CARPETA_SUBIDAS`). Es el único lugar que conoce el disco:
 * cuando se pase a almacenamiento tipo S3 (fases siguientes) solo cambia este archivo.
 */
export function crearAlmacenamiento(carpeta: string): Almacenamiento {
  const rutaDe = (clave: string) => join(carpeta, ...clave.split('/'));

  return {
    async guardarLogo(contenido, extension) {
      const clave = `empresa/logo-${randomBytes(16).toString('hex')}.${extension}`;
      const destino = rutaDe(clave);
      await mkdir(join(carpeta, 'empresa'), { recursive: true });
      const temporal = `${destino}.${randomBytes(4).toString('hex')}.tmp`;
      try {
        await writeFile(temporal, contenido, { flag: 'wx' });
        await rename(temporal, destino);
      } catch (error) {
        await rm(temporal, { force: true });
        throw error;
      }
      return clave;
    },

    async abrirLogo(clave) {
      if (!PATRON_CLAVE_LOGO.test(clave)) return null;
      const ruta = rutaDe(clave);
      try {
        const { size } = await stat(ruta);
        return { flujo: createReadStream(ruta), tamano: size };
      } catch {
        return null;
      }
    },

    async descartarLogo(clave) {
      if (!PATRON_CLAVE_LOGO.test(clave)) return;
      await rm(rutaDe(clave), { force: true });
    },

    async guardarComprobante(contenido, extension) {
      const clave = `comprobantes/${randomBytes(16).toString('hex')}.${extension}`;
      const destino = rutaDe(clave);
      await mkdir(join(carpeta, 'comprobantes'), { recursive: true });
      const temporal = `${destino}.${randomBytes(4).toString('hex')}.tmp`;
      try {
        await writeFile(temporal, contenido, { flag: 'wx' });
        await rename(temporal, destino);
      } catch (error) {
        await rm(temporal, { force: true });
        throw error;
      }
      return clave;
    },

    async abrirComprobante(clave) {
      const partes = PATRON_CLAVE_COMPROBANTE.exec(clave);
      if (!partes) return null;
      try {
        const { size } = await stat(rutaDe(clave));
        return {
          flujo: createReadStream(rutaDe(clave)),
          tamano: size,
          mime: partes[2] === 'png' ? 'image/png' : 'image/jpeg',
        };
      } catch {
        return null;
      }
    },

    async descartarComprobante(clave) {
      if (!PATRON_CLAVE_COMPROBANTE.test(clave)) return;
      await rm(rutaDe(clave), { force: true });
    },
  };
}
