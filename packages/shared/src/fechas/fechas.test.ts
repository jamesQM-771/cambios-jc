import { describe, expect, it } from 'vitest';

import { esFechaValida, esZonaHoraria, finDelDia, inicioDelDia } from './index.js';

const HORA = 3_600_000;
const largoDelDia = (fecha: string, zona: string) =>
  (finDelDia(fecha, zona).getTime() + 1 - inicioDelDia(fecha, zona).getTime()) / HORA;

describe('inicioDelDia y finDelDia', () => {
  it('Bogotá (UTC-5, sin horario de verano): el día va de 05:00Z a 04:59:59.999Z', () => {
    expect(inicioDelDia('2026-03-10', 'America/Bogota').toISOString()).toBe(
      '2026-03-10T05:00:00.000Z',
    );
    expect(finDelDia('2026-03-10', 'America/Bogota').toISOString()).toBe(
      '2026-03-11T04:59:59.999Z',
    );
  });

  it('una fila a las 11:30 p. m. y otra a las 12:30 a. m. de Bogotá quedan en días distintos', () => {
    const casiMedianoche = new Date('2026-03-10T04:30:00Z').getTime(); // 9-mar 23:30 en Bogotá
    const pasadaMedianoche = new Date('2026-03-10T05:30:00Z').getTime(); // 10-mar 00:30 en Bogotá
    const nueve = {
      desde: inicioDelDia('2026-03-09', 'America/Bogota').getTime(),
      hasta: finDelDia('2026-03-09', 'America/Bogota').getTime(),
    };

    expect(casiMedianoche >= nueve.desde && casiMedianoche <= nueve.hasta).toBe(true);
    expect(pasadaMedianoche >= nueve.desde && pasadaMedianoche <= nueve.hasta).toBe(false);
  });

  it('UTC: coincide con el día UTC', () => {
    expect(inicioDelDia('2026-03-10', 'UTC').toISOString()).toBe('2026-03-10T00:00:00.000Z');
    expect(finDelDia('2026-03-10', 'UTC').toISOString()).toBe('2026-03-10T23:59:59.999Z');
  });

  it('zona con media hora de desfase (Asia/Kolkata, UTC+5:30)', () => {
    expect(inicioDelDia('2026-03-10', 'Asia/Kolkata').toISOString()).toBe(
      '2026-03-09T18:30:00.000Z',
    );
  });

  it('el día en que empieza el horario de verano tiene 23 horas (America/New_York)', () => {
    expect(inicioDelDia('2026-03-08', 'America/New_York').toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    );
    expect(finDelDia('2026-03-08', 'America/New_York').toISOString()).toBe(
      '2026-03-09T03:59:59.999Z',
    );
    expect(largoDelDia('2026-03-08', 'America/New_York')).toBe(23);
  });

  it('el día en que termina el horario de verano tiene 25 horas', () => {
    expect(inicioDelDia('2026-11-01', 'America/New_York').toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
    expect(largoDelDia('2026-11-01', 'America/New_York')).toBe(25);
  });

  it('un día normal tiene 24 horas y los días consecutivos no dejan huecos', () => {
    expect(largoDelDia('2026-06-15', 'America/New_York')).toBe(24);
    expect(finDelDia('2026-06-15', 'America/Bogota').getTime() + 1).toBe(
      inicioDelDia('2026-06-16', 'America/Bogota').getTime(),
    );
  });

  it('cambio de mes y de año', () => {
    expect(finDelDia('2026-12-31', 'America/Bogota').toISOString()).toBe(
      '2027-01-01T04:59:59.999Z',
    );
    expect(inicioDelDia('2026-02-28', 'UTC').getTime() + 24 * HORA).toBe(
      inicioDelDia('2026-03-01', 'UTC').getTime(),
    );
  });

  it.each([['2026-02-30'], ['2026-13-01'], ['2026-00-10'], ['10/03/2026'], ['2026-3-1'], ['']])(
    'rechaza la fecha "%s"',
    (fecha) => {
      expect(() => inicioDelDia(fecha, 'America/Bogota')).toThrow(/no es válida/);
      expect(() => finDelDia(fecha, 'America/Bogota')).toThrow(/no es válida/);
    },
  );

  it('rechaza una zona horaria que no existe', () => {
    expect(() => inicioDelDia('2026-03-10', 'Mars/Phobos')).toThrow(/zona horaria/);
  });
});

describe('esFechaValida y esZonaHoraria', () => {
  it('reconoce años bisiestos', () => {
    expect(esFechaValida('2028-02-29')).toBe(true);
    expect(esFechaValida('2026-02-29')).toBe(false);
  });

  it('reconoce zonas IANA y rechaza el resto', () => {
    expect(esZonaHoraria('America/Bogota')).toBe(true);
    expect(esZonaHoraria('UTC')).toBe(true);
    expect(esZonaHoraria('Mars/Phobos')).toBe(false);
    expect(esZonaHoraria('')).toBe(false);
  });
});
