import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { CallbackPage, LoginPage, PasswordPage } from '../auth/AuthPages';
import { DraftPortfolio } from '../study/DraftPortfolio';
import { EmptyState } from '../ui/EmptyState';
import { AppShell } from './AppShell';

type DestinationProps = { title: string; description: string; emptyTitle: string; emptyDescription: string };

function Destination({ title, description, emptyTitle, emptyDescription }: DestinationProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <article className="destination-page">
      <p className="eyebrow">Estudo atual</p>
      <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
      <p className="page-introduction">{description}</p>
      <EmptyState title={emptyTitle}>{emptyDescription}</EmptyState>
    </article>
  );
}

function SessionRoot() {
  const { status } = useAuth();
  if (status === 'loading') return <p className="session-loading" role="status">Verificando sessão…</p>;
  return <Navigate to={status === 'authenticated' ? '/carteira' : '/login'} replace />;
}

function ProtectedShell() {
  const { status } = useAuth();
  if (status === 'loading') return <p className="session-loading" role="status">Verificando sessão…</p>;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ expired: status === 'expired' }} />;
  return <AppShell />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SessionRoot />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<CallbackPage />} />
      <Route path="/auth/definir-senha" element={<PasswordPage />} />
      <Route element={<ProtectedShell />}>
        <Route path="/carteira" element={<DraftPortfolio />} />
        <Route path="/diagnostico" element={<Destination title="Diagnóstico" description="Os resultados robustos serão apresentados quando uma execução estiver disponível." emptyTitle="Nenhum diagnóstico disponível" emptyDescription="Execute uma prévia e um diagnóstico para examinar a carteira." />} />
        <Route path="/comparar" element={<Destination title="Comparar cenários" description="Variantes compatíveis serão comparadas com a mesma base de evidência." emptyTitle="Nenhum cenário para comparar" emptyDescription="Crie variantes compatíveis a partir de uma carteira." />} />
        <Route path="/replay" element={<Destination title="Replay" description="Uma repetição específica poderá ser inspecionada dia a dia." emptyTitle="Nenhum replay disponível" emptyDescription="O replay depende de uma execução reproduzível." />} />
        <Route path="/premissas" element={<Destination title="Dados e premissas" description="Período, política e custos aparecerão com sua proveniência." emptyTitle="Nenhuma premissa carregada" emptyDescription="As premissas serão exibidas quando a carteira estiver disponível." />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
