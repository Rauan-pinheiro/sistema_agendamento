import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App.tsx';
import { adiantarPaginaPublica } from './api/public';

// Página pública (/<slug>): busca os dados já, em paralelo com o carregamento da rota
const ROTAS_DO_APP = new Set(['', 'login', 'register', 'termos', 'privacidade', 'dashboard', '_catalogo']);
const [, primeiro = '', resto] = window.location.pathname.split('/');
if (!resto && !ROTAS_DO_APP.has(primeiro) && /^[-a-zA-Z0-9_]+$/.test(primeiro)) adiantarPaginaPublica(primeiro);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
