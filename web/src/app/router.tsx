import { lazy, Suspense, useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { CallbackPage, LoginPage, PasswordPage } from '../auth/AuthPages';
import { EmptyState } from '../ui/EmptyState';

const AppShell = lazy(async () => ({ default: (await import('./AppShell')).AppShell }));
const CompaniesPage = lazy(async () => ({ default: (await import('../companies/CompaniesPage')).CompaniesPage }));
const CompanyCasesPage = lazy(async () => ({ default: (await import('../companies/CompanyCasesPage')).CompanyCasesPage }));
const CompanyPage = lazy(async () => ({ default: (await import('../companies/CompanyPage')).CompanyPage }));
const CompanyProfilesPage = lazy(async () => ({ default: (await import('../companies/CompanyProfilesPage')).CompanyProfilesPage }));
const ImportFlowPage = lazy(async () => ({ default: (await import('../importer/components/ImportFlowPage')).ImportFlowPage }));
const CompanyStudiesPage = lazy(async () => ({ default: (await import('../companies/CompanyStudiesPage')).CompanyStudiesPage }));
const PortfolioPage = lazy(async () => ({ default: (await import('../pages/PortfolioPage')).PortfolioPage }));
const PreviewPage = lazy(async () => ({ default: (await import('../pages/PreviewPage')).PreviewPage }));
const StudiesPage = lazy(async () => ({ default: (await import('../pages/StudiesPage')).StudiesPage }));
const StudyPortfolioPage = lazy(async () => ({ default: (await import('../pages/StudyPortfolioPage')).StudyPortfolioPage }));
const StudyComparisonPage = lazy(async () => ({ default: (await import('../pages/StudyComparisonPage')).StudyComparisonPage }));

const StudyDiagnosticPage = lazy(async () => {
  const module = await import('../pages/StudyDiagnosticPage');
  return { default: module.StudyDiagnosticPage };
});

const ReplayPage = lazy(async () => {
  const module = await import('../replay/ReplayPage');
  return { default: module.ReplayPage };
});

const PresentationRoute = lazy(async () => {
  const module = await import('../presentation/PresentationRoute');
  return { default: module.PresentationRoute };
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
  return <Suspense fallback={<p className="session-loading" role="status">Carregando área protegida…</p>}><AppShell /></Suspense>;
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
        <Route path="/estudos/:studyId/apresentacao" element={<Suspense fallback={<p role="status">Carregando apresentação…</p>}><PresentationRoute /></Suspense>} />
        <Route path="/diagnostico" element={<PreviewPage />} />
        <Route path="/comparar" element={<StudyComparisonPage />} />
        <Route path="/replay" element={<Destination title="Replay" description="Uma repetição específica poderá ser inspecionada dia a dia." emptyTitle="Nenhum replay disponível" emptyDescription="O replay depende de uma execução reproduzível." />} />
        <Route path="/premissas" element={<Destination title="Dados e premissas" description="Período, política e custos aparecerão com sua proveniência." emptyTitle="Nenhuma premissa carregada" emptyDescription="As premissas serão exibidas quando a carteira estiver disponível." />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
