import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useStudyController } from './providers';

type PageLabel = { pathname: string; label: string; onNavigateUp?: () => void };
const TrailContext = createContext<{ page: PageLabel | null; setPage: (page: PageLabel | null) => void } | null>(null);

export function WorkspaceTrailProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<PageLabel | null>(null);
  const value = useMemo(() => ({ page, setPage }), [page]);
  return <TrailContext.Provider value={value}>{children}</TrailContext.Provider>;
}

/** Page labels reuse already loaded data; the header never reads a study from storage. */
export function useWorkspaceTrailLabel(label: string | null, onNavigateUp?: () => void) {
  const setPage = useContext(TrailContext)?.setPage;
  const { pathname } = useLocation();
  useEffect(() => {
    if (!setPage || label === null) return;
    setPage({ pathname, label, ...(onNavigateUp ? { onNavigateUp } : {}) });
    return () => setPage(null);
  }, [setPage, pathname, label, onNavigateUp]);
}

type Crumb = { label: string; to?: string };
const companySections: Record<string, string> = { casos: 'Casos', perfis: 'Perfis', estudos: 'Estudos', importar: 'Importar' };

export function WorkspaceBreadcrumbs() {
  const location = useLocation();
  const controller = useStudyController();
  const subscribe = useCallback((listener: () => void) => controller.subscribe(listener), [controller]);
  const document = useSyncExternalStore(subscribe, () => controller.snapshot.document);
  const page = useContext(TrailContext)?.page;
  const localLabel = page?.pathname === location.pathname ? page : null;
  const [area, id, section] = location.pathname.split('/').filter(Boolean);
  const studies = { label: 'Estudos', to: '/estudos' };
  let crumbs: Crumb[];
  if ((area === 'estudos' || area === 'carteira') && id) {
    const study = document?.id === id ? document : null;
    const editor = `/carteira/${encodeURIComponent(id)}`;
    crumbs = [studies, { label: study?.name ?? 'Estudo', to: editor }];
    if (section === 'diagnostico') crumbs.push({ label: 'Diagnóstico' });
    if (section === 'replay' || section === 'apresentacao') {
      const params = new URLSearchParams(location.search);
      const presentation = section === 'apresentacao';
      const executionId = params.get(presentation ? 'execucao' : 'executionId');
      const scenarioId = params.get(presentation ? 'cenario' : 'scenarioId')
        ?? study?.executions.find(item => item.id === executionId)?.scenarioId;
      const selection = new URLSearchParams();
      if (scenarioId) selection.set('scenarioId', scenarioId);
      if (executionId) selection.set('executionId', executionId);
      crumbs.push({ label: 'Diagnóstico', to: `/estudos/${encodeURIComponent(id)}/diagnostico${selection.size ? `?${selection}` : ''}` });
      crumbs.push({ label: presentation ? 'Apresentação' : 'Replay' });
    }
  } else if (area === 'empresas') {
    crumbs = [{ label: 'Empresas', to: '/empresas' }];
    if (id) crumbs.push({ label: localLabel?.label ?? 'Empresa', to: `/empresas/${encodeURIComponent(id)}` });
    if (section) crumbs.push({ label: companySections[section] ?? 'Empresa' });
  } else if (area === 'quadro') crumbs = [studies, { label: 'Comparar estudos' }];
  else if (area === 'diagnostico') crumbs = [studies, { label: 'Diagnóstico' }];
  else if (area === 'importar') crumbs = [{ label: 'Importar' }];
  else if (area === 'estudos' || area === 'carteira') {
    crumbs = [studies];
    if (localLabel) crumbs.push({ label: localLabel.label });
  } else crumbs = [{ label: 'Motor de Fluxo' }];

  return <nav aria-label="Caminho de navegação" className="workspace-breadcrumbs">
    <ol className="workspace-crumbs">
      {crumbs.map((crumb, index) => <li key={`${index}-${crumb.label}`}>
        {index === crumbs.length - 1
          ? <span aria-current="page">{crumb.label}</span>
          : <Link to={crumb.to!} onClick={localLabel?.onNavigateUp}>{crumb.label}</Link>}
      </li>)}
    </ol>
  </nav>;
}
