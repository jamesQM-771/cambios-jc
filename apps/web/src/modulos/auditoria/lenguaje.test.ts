import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  cambiosDe,
  describirAccion,
  etiquetaEntidad,
  FRASES_ACCION,
  valorLegible,
} from './lenguaje.js';

/** Todas las acciones que la API registra hoy, leídas de su código (`accion: 'x.y'`). */
function accionesDeLaApi(): string[] {
  const modulos = join(import.meta.dirname, '../../../../api/src/modulos');
  const encontradas = new Set<string>();
  for (const modulo of readdirSync(modulos)) {
    const servicio = join(modulos, modulo, 'servicio.ts');
    let codigo: string;
    try {
      codigo = readFileSync(servicio, 'utf8');
    } catch {
      continue; // módulo sin servicio
    }
    for (const coincidencia of codigo.matchAll(/accion: '([a-z0-9_.]+)'/g)) {
      if (coincidencia[1]) encontradas.add(coincidencia[1]);
    }
  }
  return [...encontradas].sort();
}

describe('lenguaje de la actividad', () => {
  it('toda acción que registra la API tiene su frase', () => {
    const acciones = accionesDeLaApi();
    expect(acciones.length).toBeGreaterThan(30);

    const sinFrase = acciones.filter((accion) => !(accion in FRASES_ACCION));

    expect(sinFrase).toEqual([]);
  });

  it('una acción desconocida se muestra con su código, sin romper nada', () => {
    expect(describirAccion('remesa.registrar')).toBe('remesa.registrar');
    expect(describirAccion('tasa.publicar')).toBe('publicó una tasa');
    expect(etiquetaEntidad('linea_negocio')).toBe('Líneas de negocio');
    expect(etiquetaEntidad('otra_cosa')).toBe('otra_cosa');
  });

  it('los valores se leen como texto: sí, no o raya', () => {
    expect(valorLegible(true)).toBe('Sí');
    expect(valorLegible(false)).toBe('No');
    expect(valorLegible(null)).toBe('—');
    expect(valorLegible('')).toBe('—');
    expect(valorLegible('5.190000')).toBe('5.190000');
    expect(valorLegible({ a: 1 })).toBe('{"a":1}');
  });
});

describe('cambiosDe', () => {
  it('lista solo los campos cuyo valor cambió, con nombres legibles', () => {
    expect(
      cambiosDe(
        { nombre: 'Casa Vieja', nit: '900123456-7', zonaHoraria: 'America/Bogota' },
        { nombre: 'Casa Nueva', nit: '900123456-7', zonaHoraria: 'America/Caracas' },
      ),
    ).toEqual([
      { campo: 'Nombre', antes: 'Casa Vieja', despues: 'Casa Nueva' },
      { campo: 'Zona horaria', antes: 'America/Bogota', despues: 'America/Caracas' },
    ]);
  });

  it('en una creación todo es nuevo', () => {
    expect(cambiosDe(null, { codigoBanco: '0102', activo: true })).toEqual([
      { campo: 'Código del banco', antes: '—', despues: '0102' },
      { campo: 'Activo', antes: '—', despues: 'Sí' },
    ]);
  });

  it('un campo sin traducción conserva su nombre', () => {
    expect(cambiosDe({ algoNuevo: 1 }, { algoNuevo: 2 })).toEqual([
      { campo: 'algoNuevo', antes: '1', despues: '2' },
    ]);
  });

  it('sin datos, o con datos que no son objetos, no hay lista', () => {
    expect(cambiosDe(null, null)).toEqual([]);
    expect(cambiosDe('texto', ['lista'])).toEqual([]);
  });
});
