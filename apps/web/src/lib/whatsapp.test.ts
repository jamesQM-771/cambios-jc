import { describe, expect, it } from 'vitest';

import { enlaceWhatsApp } from './whatsapp.js';

describe('enlaceWhatsApp', () => {
  it('codifica el texto y deja elegir el contacto si no hay teléfono', () => {
    expect(enlaceWhatsApp('Recibo N° 128\nCOP 162.000')).toBe(
      'https://wa.me/?text=Recibo%20N%C2%B0%20128%0ACOP%20162.000',
    );
  });

  it('con teléfono usa solo los dígitos, en formato internacional', () => {
    expect(enlaceWhatsApp('Hola', '+57 300 123 4567')).toBe('https://wa.me/573001234567?text=Hola');
  });
});
