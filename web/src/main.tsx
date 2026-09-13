import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AppRoutes } from './app/router';
import { AuthProvider } from './auth/AuthProvider';
import './styles/tokens.css';
import './styles/global.css';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('Elemento raiz da aplicação não encontrado.');
}
const rootElement = root;

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

async function bootstrap() {
  const { getSupabaseAuthClient } = await import('./auth/supabaseClient');
  const authClient = getSupabaseAuthClient();
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider
          client={authClient}
          onIdentityChange={(previous, next) => { if (previous !== next) queryClient.clear(); }}
          onSignedOut={() => queryClient.clear()}
        >
          <BrowserRouter><AppRoutes /></BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

void bootstrap();
