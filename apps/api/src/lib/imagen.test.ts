import { describe, expect, it } from 'vitest';

import { jpegDePrueba, pngDePrueba } from '../../test/imagenes.js';

import { detectarImagen } from './imagen.js';

describe('detectarImagen', () => {
  it('reconoce un PNG por su firma y su cabecera', () => {
    expect(detectarImagen(pngDePrueba())).toEqual({
      tipo: 'png',
      extension: 'png',
      mime: 'image/png',
    });
  });

  it('reconoce un JPEG por su firma', () => {
    expect(detectarImagen(jpegDePrueba())).toEqual({
      tipo: 'jpeg',
      extension: 'jpg',
      mime: 'image/jpeg',
    });
  });

  it.each([
    ['vacío', Buffer.alloc(0)],
    ['un solo byte', Buffer.from([0xff])],
    ['solo la firma JPEG, sin contenido', Buffer.from([0xff, 0xd8, 0xff])],
    [
      'la firma PNG sin cabecera IHDR',
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ],
    ['un PNG cortado a la mitad de la cabecera', pngDePrueba().subarray(0, 18)],
    ['GIF', Buffer.from('GIF89a\u0001\u0000\u0001\u0000', 'latin1')],
    ['WebP', Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ', 'latin1')],
    ['PDF', Buffer.from('%PDF-1.7\n', 'latin1')],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ['HTML', Buffer.from('<html><body>hola</body></html>')],
    ['texto con extensión de imagen', Buffer.from('esto no es una imagen')],
  ])('rechaza %s', (_caso, contenido) => {
    expect(detectarImagen(contenido)).toBeNull();
  });

  it('un PNG con relleno detrás de la cabecera sigue siendo PNG', () => {
    expect(detectarImagen(pngDePrueba(5000))?.tipo).toBe('png');
  });
});
