import { describe, expect, it } from 'vitest';

import { NOMBRE_APP } from './index.js';

describe('app web', () => {
  it('se puede importar', () => {
    expect(NOMBRE_APP).toBe('web');
  });
});
