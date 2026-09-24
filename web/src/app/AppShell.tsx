import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { ChatProvider } from '../chat/ChatProvider';
import { ChatPanel } from '../chat/components/ChatPanel';
import { useApiClient, useChatRepository } from './providers';
import { useProductHelpCatalog } from '../help/HelpCatalogProvider';

const destinations = [
  { to: '/empresas', label: 'Empresas' },
  { to: '/estudos', label: 'Estudos' },
  { to: '/importar', label: 'Importar' },
];

export function AppShell() {
  const { userId, signOut } = useAuth();
  const chatRepository = useChatRepository();
  const apiClient = useApiClient();
  const helpCatalog = useProductHelpCatalog();
  const location = useLocation();
  const studyId = /^\/(?:estudos|carteira)\/([^/]+)/.exec(location.pathname)?.[1];
  const navigation = [...destinations, {
    to: studyId === undefined ? '/diagnostico' : `/estudos/${studyId}/diagnostico`,
    label: 'Diagnóstico',
  }];
  return <ChatProvider key={userId} ownerSub={userId!} repository={chatRepository} client={apiClient} catalog={helpCatalog ?? null}>
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <aside className="sidebar">
        <div>
          <p className="product-kicker">Análise de câmbio</p>
          <p className="product-name">Motor de Fluxo</p>
        </div>
        <nav aria-label="Navegação principal">
          <ul className="destination-list">
            {navigation.map((destination) => (
              <li key={destination.to}>
                <NavLink to={destination.to} end={destination.to === '/empresas' || destination.to === '/estudos'} className="destination-link">
                  {destination.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="session-label">
          <span>Sessão protegida</span>
          <small title={userId ?? undefined}>Conta autenticada</small>
          <button className="session-signout" type="button" onClick={() => void signOut()}>Sair</button>
        </div>
      </aside>
      <section className="workspace">
        <header className="workspace-header">
          <p>Estudo</p>
          <strong>Ainda não iniciado</strong>
          <ChatPanel />
        </header>
        <main id="main-content" className="workspace-content">
          <Outlet />
        </main>
      </section>
    </div>
  </ChatProvider>;
}
