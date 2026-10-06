import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { ChatProvider } from '../chat/ChatProvider';
import { ChatPanel } from '../chat/components/ChatPanel';
import { selectionId } from '../chat/routeContext';
import { useApiClient, useChatRepository } from './providers';
import { useProductHelpCatalog } from '../help/HelpCatalogProvider';
import { useTheme } from './theme';
import { WorkspaceBreadcrumbs, WorkspaceTrailProvider } from './WorkspaceBreadcrumbs';

const ICONS = {
  companies: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M3 21h18',
  studies: 'M9 3h6M10 3v6L4.5 18.5A1.6 1.6 0 0 0 5.9 21h12.2a1.6 1.6 0 0 0 1.4-2.5L14 9V3M7 15h10',
  board: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4v16M15 4v16',
  import: 'M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  diagnostic: 'M3 12h4l3-8 4 16 3-8h4',
  present: 'M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM12 16v4M8 20h8',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
} as const;

function Icon({ name }: Readonly<{ name: keyof typeof ICONS }>) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name]} /></svg>;
}

// Três destinos. Diagnóstico abre por estudo; o quadro comparativo é "Comparar estudos", em Estudos.
const destinations = [
  { to: '/estudos', label: 'Estudos', icon: 'studies' },
  { to: '/empresas', label: 'Empresas', icon: 'companies' },
  { to: '/importar', label: 'Importar', icon: 'import' },
] as const;

export function AppShell() {
  const { userId, userEmail, signOut } = useAuth();
  const chatRepository = useChatRepository();
  const apiClient = useApiClient();
  const helpCatalog = useProductHelpCatalog();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const studyId = /^\/(?:estudos|carteira)\/([^/]+)/.exec(location.pathname)?.[1];
  const search = new URLSearchParams(location.search);
  const onPresentation = location.pathname.endsWith('/apresentacao');
  const scenarioId = selectionId(search.get(onPresentation ? 'cenario' : 'scenarioId'));
  const executionId = selectionId(search.get(onPresentation ? 'execucao' : 'executionId'));
  const navigation: { to: string; label: string; icon: keyof typeof ICONS }[] = [...destinations];
  if (studyId !== undefined && scenarioId !== null && executionId !== null
    && (onPresentation || location.pathname.endsWith('/diagnostico'))) navigation.push({
    to: `/estudos/${encodeURIComponent(studyId)}/apresentacao?cenario=${encodeURIComponent(scenarioId)}&execucao=${encodeURIComponent(executionId)}`,
    label: 'Apresentar',
    icon: 'present',
  });

  const studyArea = /^\/(?:estudos|carteira|quadro|diagnostico)(?:\/|$)/.test(location.pathname);
  return <ChatProvider key={userId} ownerSub={userId!} repository={chatRepository} client={apiClient} catalog={helpCatalog ?? null}>
    <WorkspaceTrailProvider><div className="app-shell">
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <aside className="sidebar">
        <div className="product-brand">
          <span className="product-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round"><path d={ICONS.diagnostic} /></svg></span>
          <div>
            <p className="product-name">Motor de Fluxo</p>
            <p className="product-kicker">Análise de câmbio</p>
          </div>
        </div>
        <nav aria-label="Navegação principal">
          <p className="nav-section-label" aria-hidden="true">Trabalho</p>
          <ul className="destination-list">
            {navigation.map((destination) => (
              <li key={destination.to}>
                <NavLink to={destination.to} end={destination.to === '/empresas'} className={({ isActive }) => `destination-link${isActive || (destination.to === '/estudos' && studyArea) ? ' active' : ''}`}
                  {...(destination.to === '/estudos' && studyArea ? { 'aria-current': 'page' as const } : {})}>
                  <span className="destination-tile" aria-hidden="true"><span><Icon name={destination.icon} /></span></span>
                  {destination.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <section className="session-profile" aria-label="Perfil">
          <div className="session-profile__identity">
            <span className="session-profile__avatar" aria-hidden="true">{(userEmail ?? '?').charAt(0).toUpperCase()}</span>
            <div>
              <span className="session-profile__label">Perfil</span>
              <small className="session-profile__email" title={userEmail ?? userId ?? undefined}>{userEmail ?? 'Conta autenticada'}</small>
            </div>
          </div>
          <div className="session-profile__actions">
            <button className="session-signout" type="button" onClick={() => void signOut()}>Sair</button>
            <button className="theme-toggle" type="button" onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
          </div>
        </section>
      </aside>
      <section className="workspace">
        <header className="workspace-header">
          <WorkspaceBreadcrumbs />
        </header>
        <main id="main-content" className="workspace-content">
          <Outlet />
        </main>
      </section>
      <ChatPanel />
    </div>
    </WorkspaceTrailProvider>
  </ChatProvider>;
}
