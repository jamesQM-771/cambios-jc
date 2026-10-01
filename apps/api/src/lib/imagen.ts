export type TipoImagen = 'png' | 'jpeg';

export interface ImagenDetectada {
  tipo: TipoImagen;
  extension: 'png' | 'jpg';
  mime: 'image/png' | 'image/jpeg';
}

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const FIRMA_JPEG = Buffer.from([0xff, 0xd8, 0xff]);

// Un PNG válido empieza con la firma de 8 bytes y, enseguida, el bloque "IHDR" (cabecera de la imagen).
const POSICION_IHDR = 12;
const LONGITUD_MINIMA_PNG = 24;

/**
 * Identifica una imagen PNG o JPEG por su contenido (los primeros bytes), nunca por el nombre ni por
 * el tipo que declare quien la sube. Devuelve `null` para cualquier otra cosa, incluido SVG (que
 * puede llevar código) y archivos vacíos o truncados.
 */
export function detectarImagen(contenido: Buffer): ImagenDetectada | null {
  if (
    contenido.length >= LONGITUD_MINIMA_PNG &&
    contenido.subarray(0, FIRMA_PNG.length).equals(FIRMA_PNG) &&
    contenido.subarray(POSICION_IHDR, POSICION_IHDR + 4).toString('latin1') === 'IHDR'
  ) {
    return { tipo: 'png', extension: 'png', mime: 'image/png' };
  }
  if (
    contenido.length > FIRMA_JPEG.length &&
    contenido.subarray(0, FIRMA_JPEG.length).equals(FIRMA_JPEG)
  ) {
    return { tipo: 'jpeg', extension: 'jpg', mime: 'image/jpeg' };
  }
  return null;
}
