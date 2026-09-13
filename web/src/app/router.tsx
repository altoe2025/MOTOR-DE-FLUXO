import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './AppShell';
import { EmptyState } from '../ui/EmptyState';
import { TextField } from '../ui/TextField';

type SessionState = 'loading' | 'resolved';

type DestinationProps = {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
};

function Destination({ title, description, emptyTitle, emptyDescription }: DestinationProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <article className="destination-page">
      <p className="eyebrow">Estudo atual</p>
      <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
      <p className="page-introduction">{description}</p>
      <EmptyState title={emptyTitle}>{emptyDescription}</EmptyState>
    </article>
  );
}

function PortfolioPage() {
  return (
    <Destination
      title="Carteira"
      description="Descreva uma carteira para organizar uma prévia reproduzível."
      emptyTitle="Ainda não há uma carteira para analisar"
      emptyDescription="Os dados informados aparecerão aqui antes de qualquer execução."
    />
  );
}

function SessionRoot({ sessionState }: { sessionState: SessionState }) {
  if (sessionState === 'loading') {
    return <p className="session-loading" role="status">Verificando sessão…</p>;
  }

  return <Navigate to="/carteira" replace />;
}

function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-heading">
        <p className="eyebrow">Motor de Fluxo</p>
        <h1 id="login-heading">Entrar</h1>
        <p>A autenticação será conectada em uma etapa posterior.</p>
        <form aria-label="Formulário de entrada">
          <TextField id="email" label="E-mail" type="email" autoComplete="email" />
          <TextField id="password" label="Senha" type="password" autoComplete="current-password" />
          <button className="button" type="button" disabled>Entrar</button>
        </form>
      </section>
    </main>
  );
}

function AuthMessage({ title, message }: { title: string; message: string }) {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-heading">
        <p className="eyebrow">Motor de Fluxo</p>
        <h1 id="auth-heading">{title}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

export function AppRoutes({ sessionState }: { sessionState: SessionState }) {
  return (
    <Routes>
      <Route path="/" element={<SessionRoot sessionState={sessionState} />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthMessage title="Confirmando acesso" message="A confirmação de acesso será concluída aqui." />} />
      <Route path="/auth/definir-senha" element={<AuthMessage title="Definir senha" message="A definição de senha será conectada ao provedor de acesso." />} />
      <Route element={<AppShell />}>
        <Route path="/carteira" element={<PortfolioPage />} />
        <Route path="/diagnostico" element={<Destination title="Diagnóstico" description="Os resultados robustos serão apresentados quando uma execução estiver disponível." emptyTitle="Nenhum diagnóstico disponível" emptyDescription="Execute uma prévia e um diagnóstico para examinar a carteira." />} />
        <Route path="/comparar" element={<Destination title="Comparar cenários" description="Variantes compatíveis serão comparadas com a mesma base de evidência." emptyTitle="Nenhum cenário para comparar" emptyDescription="Crie variantes compatíveis a partir de uma carteira." />} />
        <Route path="/replay" element={<Destination title="Replay" description="Uma repetição específica poderá ser inspecionada dia a dia." emptyTitle="Nenhum replay disponível" emptyDescription="O replay depende de uma execução reproduzível." />} />
        <Route path="/premissas" element={<Destination title="Dados e premissas" description="Período, política e custos aparecerão com sua proveniência." emptyTitle="Nenhuma premissa carregada" emptyDescription="As premissas serão exibidas quando a carteira estiver disponível." />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
