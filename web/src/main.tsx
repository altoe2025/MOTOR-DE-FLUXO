import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { ApplicationProviders } from './app/providers';
import { AppRoutes } from './app/router';
import { AuthProvider } from './auth/AuthProvider';
import './styles/tokens.css';
import './styles/global.css';
import './styles/print.css';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('Elemento raiz da aplicação não encontrado.');
}
const rootElement = root;

async function bootstrap() {
  if (import.meta.env.MODE === 'e2e') {
    const { installE2EBridge } = await import('./e2eBridge');
    installE2EBridge();
  }
  const authClient = import.meta.env.MODE === 'e2e'
    ? (await import('./auth/e2eAuthClient')).createE2eAuthClient()
    : (await import('./auth/supabaseClient')).getSupabaseAuthClient();
  createRoot(rootElement).render(
    <StrictMode>
      <AuthProvider client={authClient}>
        <ApplicationProviders>
          <BrowserRouter><AppRoutes /></BrowserRouter>
        </ApplicationProviders>
      </AuthProvider>
    </StrictMode>,
  );
}

void bootstrap();
