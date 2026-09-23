import { lazy, Suspense, useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { CallbackPage, LoginPage, PasswordPage } from '../auth/AuthPages';
import { CompaniesPage } from '../companies/CompaniesPage';
import { CompanyCasesPage } from '../companies/CompanyCasesPage';
import { CompanyPage } from '../companies/CompanyPage';
import { CompanyProfilesPage } from '../companies/CompanyProfilesPage';
import { ImportFlowPage } from '../importer/components/ImportFlowPage';
import { CompanyStudiesPage } from '../companies/CompanyStudiesPage';
import { PortfolioPage } from '../pages/PortfolioPage';
import { PreviewPage } from '../pages/PreviewPage';
import { StudiesPage } from '../pages/StudiesPage';
import { StudyPortfolioPage } from '../pages/StudyPortfolioPage';
import { StudyComparisonPage } from '../pages/StudyComparisonPage';
import { EmptyState } from '../ui/EmptyState';
import { AppShell } from './AppShell';

const StudyDiagnosticPage = lazy(async () => {
  const module = await import('../pages/StudyDiagnosticPage');
  return { default: module.StudyDiagnosticPage };
});

const ReplayPage = lazy(async () => {
  const module = await import('../replay/ReplayPage');
  return { default: module.ReplayPage };
});

function DiagnosticRoute() {
  return <Suspense fallback={<p role="status">Carregando diagnóstico…</p>}><StudyDiagnosticPage /></Suspense>;
}

function ReplayRoute() {
  return <Suspense fallback={<p role="status">Carregando Replay…</p>}><ReplayPage /></Suspense>;
}

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

function LegacyStudyRedirect() {
  const { studyId } = useParams();
  return <Navigate to={studyId === undefined ? '/estudos' : `/carteira/${studyId}`} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SessionRoot />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<CallbackPage />} />
      <Route path="/auth/definir-senha" element={<PasswordPage />} />
      <Route element={<ProtectedShell />}>
        <Route path="/empresas" element={<CompaniesPage />} />
        <Route path="/empresas/:companyId" element={<CompanyPage />} />
        <Route path="/empresas/:companyId/casos" element={<CompanyCasesPage />} />
        <Route path="/empresas/:companyId/perfis" element={<CompanyProfilesPage />} />
        <Route path="/empresas/:companyId/estudos" element={<CompanyStudiesPage />} />
        <Route path="/empresas/:companyId/importar" element={<ImportFlowPage />} />
        <Route path="/importar" element={<ImportFlowPage />} />
        <Route path="/carteira" element={<PortfolioPage />} />
        <Route path="/carteira/:id" element={<StudyPortfolioPage />} />
        <Route path="/estudos" element={<StudiesPage />} />
        <Route path="/estudos/:studyId" element={<LegacyStudyRedirect />} />
        <Route path="/estudos/:studyId/diagnostico" element={<DiagnosticRoute />} />
        <Route path="/estudos/:studyId/replay" element={<ReplayRoute />} />
        <Route path="/diagnostico" element={<PreviewPage />} />
        <Route path="/comparar" element={<StudyComparisonPage />} />
        <Route path="/replay" element={<Destination title="Replay" description="Uma repetição específica poderá ser inspecionada dia a dia." emptyTitle="Nenhum replay disponível" emptyDescription="O replay depende de uma execução reproduzível." />} />
        <Route path="/premissas" element={<Destination title="Dados e premissas" description="Período, política e custos aparecerão com sua proveniência." emptyTitle="Nenhuma premissa carregada" emptyDescription="As premissas serão exibidas quando a carteira estiver disponível." />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
