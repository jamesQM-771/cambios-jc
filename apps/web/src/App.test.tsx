import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { App } from './App.js';

describe('App', () => {
  it('muestra el nombre del sistema', () => {
    expect(renderToString(<App />)).toContain('Cambios JC');
  });
});
