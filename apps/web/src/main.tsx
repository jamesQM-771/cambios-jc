import './estilos/tokens.css';
import './estilos/base.css';
import './estilos/componentes.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { App } from './App.js';
import { crearClienteConsultas } from './lib/consulta.js';
import { iniciarSentry } from './lib/sentry.js';
import { iniciarTema } from './lib/tema.js';

iniciarSentry(import.meta.env.VITE_SENTRY_DSN, import.meta.env.MODE);

// El tema elegido se aplica antes de pintar la primera pantalla.
iniciarTema();

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('No se encontró el elemento #raiz');

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={crearClienteConsultas()}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
