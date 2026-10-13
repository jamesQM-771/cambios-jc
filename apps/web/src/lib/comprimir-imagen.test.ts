import { describe, expect, it } from 'vitest';

import { comprimirImagen, dimensionesReducidas, OBJETIVO_BYTES } from './comprimir-imagen.js';

describe('dimensionesReducidas', () => {
  it('no toca una imagen que ya cabe', () => {
    expect(dimensionesReducidas(800, 600)).toEqual({ ancho: 800, alto: 600 });
    expect(dimensionesReducidas(1600, 1200)).toEqual({ ancho: 1600, alto: 1200 });
  });

  it('reduce manteniendo la proporción', () => {
    expect(dimensionesReducidas(4000, 3000)).toEqual({ ancho: 1600, alto: 1200 });
    expect(dimensionesReducidas(1500, 4500)).toEqual({ ancho: 533, alto: 1600 });
  });
});

describe('comprimirImagen', () => {
  it('devuelve el mismo archivo si ya pesa poco', async () => {
    const pequeno = new Blob([new Uint8Array(1000)], { type: 'image/png' });

    expect(await comprimirImagen(pequeno)).toBe(pequeno);
  });

  it('si el navegador no puede reducirla, la devuelve tal cual para que el servidor decida', async () => {
    // jsdom no trae createImageBitmap: es justo el caso de un navegador sin soporte.
    const grande = new Blob([new Uint8Array(OBJETIVO_BYTES + 10)], { type: 'image/jpeg' });

    expect(await comprimirImagen(grande)).toBe(grande);
  });
});
