import { describe, expect, it } from 'vitest';

import { errorDeTelefono, formatearTelefono, separarTelefono, unirTelefono } from './telefono.js';

describe('separarTelefono', () => {
  it('reconoce el país por su prefijo', () => {
    expect(separarTelefono('+573001234567')).toEqual({ prefijo: '57', numero: '3001234567' });
    expect(separarTelefono('+584121234567')).toEqual({ prefijo: '58', numero: '4121234567' });
  });

  it('prefiere el prefijo más largo cuando dos empiezan igual', () => {
    expect(separarTelefono('+593991234567')).toEqual({ prefijo: '593', numero: '991234567' });
    expect(separarTelefono('+5078001234')).toEqual({ prefijo: '507', numero: '8001234' });
  });

  it('acepta el formato antiguo con espacios, paréntesis y guiones', () => {
    expect(separarTelefono('+57 (300) 123-4567')).toEqual({ prefijo: '57', numero: '3001234567' });
  });

  it('un número antiguo sin + se toma como local del país por defecto', () => {
    expect(separarTelefono('300 123 4567')).toEqual({ prefijo: '57', numero: '3001234567' });
  });

  it('vacío o nulo no tiene número', () => {
    expect(separarTelefono('')).toEqual({ prefijo: '57', numero: '' });
    expect(separarTelefono(null)).toEqual({ prefijo: '57', numero: '' });
  });
});

describe('unirTelefono', () => {
  it('arma el formato internacional sin espacios', () => {
    expect(unirTelefono('57', '300 123 4567')).toBe('+573001234567');
  });

  it('sin número devuelve vacío, no un prefijo suelto', () => {
    expect(unirTelefono('57', '')).toBe('');
    expect(unirTelefono('58', ' - ')).toBe('');
  });

  it('lo que arma cumple el patrón que valida la API', () => {
    const patronApi = /^[+0-9][0-9\s()-]{5,19}$/;
    expect(unirTelefono('57', '3001234567')).toMatch(patronApi);
    expect(unirTelefono('593', '991234567')).toMatch(patronApi);
  });
});

describe('formatearTelefono', () => {
  it('agrupa de a tres con los últimos cuatro juntos', () => {
    expect(formatearTelefono('+573001234567')).toBe('+57 300 123 4567');
    expect(formatearTelefono('+584121234567')).toBe('+58 412 123 4567');
    expect(formatearTelefono('+5078001234')).toBe('+507 800 1234');
  });

  it('sin teléfono devuelve vacío', () => {
    expect(formatearTelefono(null)).toBe('');
    expect(formatearTelefono('')).toBe('');
  });
});

describe('errorDeTelefono', () => {
  it('vacío es válido: el teléfono es opcional', () => {
    expect(errorDeTelefono('')).toBeNull();
  });

  it('rechaza números demasiado cortos o largos', () => {
    expect(errorDeTelefono('12345')).toMatch(/entre 7 y 12 dígitos/);
    expect(errorDeTelefono('1234567890123')).toMatch(/entre 7 y 12 dígitos/);
  });

  it('acepta un celular de Colombia o de Venezuela', () => {
    expect(errorDeTelefono('3001234567')).toBeNull();
    expect(errorDeTelefono('4121234567')).toBeNull();
  });
});
