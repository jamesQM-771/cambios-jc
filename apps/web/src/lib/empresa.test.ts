import { describe, expect, it } from 'vitest';

import {
  DIRECCION_VACIA,
  errorDeNit,
  formatearNit,
  separarDireccion,
  separarNit,
  unirDireccion,
  unirNit,
} from './empresa.js';

describe('NIT', () => {
  it('separa el número y el dígito de verificación, con o sin puntos', () => {
    expect(separarNit('900.123.456-7')).toEqual({ numero: '900123456', digito: '7' });
    expect(separarNit('900123456-7')).toEqual({ numero: '900123456', digito: '7' });
    expect(separarNit('900123456')).toEqual({ numero: '900123456', digito: '' });
    expect(separarNit(null)).toEqual({ numero: '', digito: '' });
  });

  it('se guarda sin puntos y con el dígito tras un guion', () => {
    expect(unirNit({ numero: '900123456', digito: '7' })).toBe('900123456-7');
    expect(unirNit({ numero: '900123456', digito: '' })).toBe('900123456');
    expect(unirNit({ numero: '', digito: '7' })).toBe('');
  });

  it('lo que se guarda cumple el patrón que valida la API', () => {
    expect(unirNit({ numero: '900123456', digito: '7' })).toMatch(/^[0-9.-]{5,20}$/);
  });

  it('descarta letras y deja un solo dígito de verificación', () => {
    expect(unirNit({ numero: '9a0b0.1', digito: '78' })).toBe('9001-7');
  });

  it('se muestra con puntos de miles', () => {
    expect(formatearNit('900123456-7')).toBe('900.123.456-7');
    expect(formatearNit('900.123.456-7')).toBe('900.123.456-7');
    expect(formatearNit('12345')).toBe('12.345');
    expect(formatearNit('')).toBe('');
  });

  it('vacío es válido; menos de 5 dígitos, no', () => {
    expect(errorDeNit('')).toBeNull();
    expect(errorDeNit('1234')).toMatch(/al menos 5 dígitos/);
    expect(errorDeNit('900123456')).toBeNull();
  });
});

describe('dirección', () => {
  const completa = {
    tipoVia: 'Calle',
    via: '10',
    numero: '5',
    placa: '23',
    complemento: 'Local 2',
    ciudad: 'Cúcuta',
    departamento: 'Norte de Santander',
    pais: 'Colombia',
  };

  it('une las partes en un solo texto', () => {
    expect(unirDireccion(completa)).toBe(
      'Calle 10 # 5-23 Local 2, Cúcuta, Norte de Santander, Colombia',
    );
  });

  it('omite lo que no se escribió', () => {
    expect(unirDireccion({ ...DIRECCION_VACIA, via: '1', numero: '2', placa: '3' })).toBe(
      'Calle 1 # 2-3',
    );
    expect(
      unirDireccion({ ...DIRECCION_VACIA, tipoVia: 'Avenida', via: '0', ciudad: 'Cúcuta' }),
    ).toBe('Avenida 0, Cúcuta');
  });

  it('sin vía ni ciudad no hay dirección', () => {
    expect(unirDireccion(DIRECCION_VACIA)).toBe('');
    expect(unirDireccion({ ...DIRECCION_VACIA, pais: 'Colombia', complemento: 'Local 2' })).toBe(
      '',
    );
  });

  it('quita las comas de dentro de una parte, porque separan las partes', () => {
    expect(unirDireccion({ ...completa, complemento: 'Local 2, piso 3' })).toBe(
      'Calle 10 # 5-23 Local 2 piso 3, Cúcuta, Norte de Santander, Colombia',
    );
  });

  it('lo que une lo vuelve a separar igual', () => {
    expect(separarDireccion(unirDireccion(completa))).toEqual(completa);
    const corta = {
      ...DIRECCION_VACIA,
      tipoVia: 'Carrera',
      via: '5A',
      numero: '12',
      ciudad: 'Cúcuta',
    };
    expect(separarDireccion(unirDireccion(corta))).toEqual(corta);
  });

  it('vacía se separa en partes vacías', () => {
    expect(separarDireccion('')).toEqual(DIRECCION_VACIA);
    expect(separarDireccion(null)).toEqual(DIRECCION_VACIA);
  });

  it('una dirección antigua escrita a mano no se adivina', () => {
    expect(separarDireccion('Frente al parque, al lado de la panadería')).toBeNull();
    expect(separarDireccion('Cl 10 5-23 centro')).toBeNull();
    expect(separarDireccion('Calle 1 # 2-3, a, b, c, d')).toBeNull();
  });
});
