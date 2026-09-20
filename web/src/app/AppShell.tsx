import { NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';

const destinations = [
  { to: '/estudos', label: 'Estudos' },
  { to: '/carteira', label: 'Carteira' },
  { to: '/diagnostico', label: 'Diagnóstico' },
  { to: '/comparar', label: 'Comparar cenários' },
  { to: '/replay', label: 'Replay' },
  { to: '/premissas', label: 'Dados e premissas' },
];

export function AppShell() {
  const { userId, signOut } = useAuth();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <aside className="sidebar" aria-label="Navegação principal">
        <div>
          <p className="product-kicker">Análise de câmbio</p>
          <p className="product-name">Motor de Fluxo</p>
        </div>
        <nav aria-label="Destinos do estudo">
          <ul className="destination-list">
            {destinations.map((destination) => (
              <li key={destination.to}>
                <NavLink to={destination.to} className="destination-link">
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
        </header>
        <main id="main-content" className="workspace-content">
          <Outlet />
        </main>
      </section>
    </div>
  );
}
