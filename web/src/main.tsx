import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { AppRoutes } from './app/router';
import './styles/tokens.css';
import './styles/global.css';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('Elemento raiz da aplicação não encontrado.');
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AppRoutes sessionState="resolved" />
    </BrowserRouter>
  </StrictMode>,
);
