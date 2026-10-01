import { randomBytes } from 'node:crypto';

/** Un PNG con firma y cabecera IHDR válidas (no es una imagen dibujable: basta para probar la detección). */
export function pngDePrueba(bytesDeRelleno = 0): Buffer {
  const firma = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const longitud = Buffer.from([0x00, 0x00, 0x00, 0x0d]);
  const ihdr = Buffer.concat([Buffer.from('IHDR', 'latin1'), Buffer.alloc(13), Buffer.alloc(4)]);
  return Buffer.concat([firma, longitud, ihdr, Buffer.alloc(bytesDeRelleno, 1)]);
}

/** Un JPEG con la firma `FF D8 FF E0` y el cierre `FF D9`. */
export function jpegDePrueba(bytesDeRelleno = 0): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from('JFIF', 'latin1'),
    Buffer.alloc(bytesDeRelleno, 2),
    Buffer.from([0xff, 0xd9]),
  ]);
}

export interface ParteArchivo {
  campo: string;
  nombreArchivo: string;
  tipoMime: string;
  contenido: Buffer;
}

export interface ParteTexto {
  campo: string;
  valor: string;
}

/** Arma un cuerpo `multipart/form-data` a mano, para inyectarlo en las pruebas. */
export function formularioConArchivos(partes: (ParteArchivo | ParteTexto)[]): {
  payload: Buffer;
  headers: { 'content-type': string };
} {
  const limite = `----prueba${randomBytes(8).toString('hex')}`;
  const trozos: Buffer[] = [];
  for (const parte of partes) {
    if ('contenido' in parte) {
      trozos.push(
        Buffer.from(
          `--${limite}\r\nContent-Disposition: form-data; name="${parte.campo}"; filename="${parte.nombreArchivo}"\r\n` +
            `Content-Type: ${parte.tipoMime}\r\n\r\n`,
        ),
        parte.contenido,
        Buffer.from('\r\n'),
      );
    } else {
      trozos.push(
        Buffer.from(
          `--${limite}\r\nContent-Disposition: form-data; name="${parte.campo}"\r\n\r\n${parte.valor}\r\n`,
        ),
      );
    }
  }
  trozos.push(Buffer.from(`--${limite}--\r\n`));
  return {
    payload: Buffer.concat(trozos),
    headers: { 'content-type': `multipart/form-data; boundary=${limite}` },
  };
}

/** Formulario con un solo archivo en el campo `logo`. */
export const formularioLogo = (nombreArchivo: string, tipoMime: string, contenido: Buffer) =>
  formularioConArchivos([{ campo: 'logo', nombreArchivo, tipoMime, contenido }]);
