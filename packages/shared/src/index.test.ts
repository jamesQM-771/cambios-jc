import { describe, expect, it } from 'vitest';

import { NOMBRE_SISTEMA } from './index.js';

describe('paquete shared', () => {
  it('exporta el nombre del sistema', () => {
    expect(NOMBRE_SISTEMA).toBe('Cambios JC');
  });
});
