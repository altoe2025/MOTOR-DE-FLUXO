import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useApiClient, useStudyController } from '../app/providers';
import type { CompanyRecord, ObservedCase } from '../cases/domain';
import { resolvePortfolioSource } from '../preparation/resolvePortfolioSource';
import { StudyEditor } from '../study/components/StudyEditor';
import type { PortfolioSourceDraft } from '../study/components/PortfolioSourceSelector';
import { duplicateStudy, renameStudy, updateScenario } from '../study/domain';
import type { StudyDocument } from '../study/model';

export function StudyPortfolioPage() {
  const { id } = useParams();
  const controller = useStudyController();
  const api = useApiClient();
  const navigate = useNavigate();
  const [study, setStudy] = useState<StudyDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState<ObservedCase[]>([]);
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);

  useEffect(() => {
    if (!id) return;
    void Promise.all([controller.loadStudy(id), controller.listObservedCases(), controller.listCompanies()])
      .then(([loaded, observed, companyRecords]) => { setStudy(loaded); setCases(observed); setCompanies(companyRecords); setError(null); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o estudo.'));
    return controller.subscribe(() => setStudy(controller.snapshot.document));
  }, [controller, id]);

  if (study === null) return <article className="destination-page"><h1 tabIndex={-1}>Estudo não encontrado</h1><p>{error ?? 'O estudo pode ter sido removido ou pertencer a outra conta.'}</p></article>;
  const scenario = study.scenarios.find((item) => item.id === study.baseScenarioId);
  if (scenario === undefined) throw new Error('Estudo sem cenário base.');
  const save = (next: StudyDocument) => { controller.edit(next); setStudy(next); };
  const applySource = async (source: PortfolioSourceDraft) => {
    try {
      if (api.preparePortfolio === undefined) throw new Error('A preparação de carteira não está disponível.');
      const dependencies = { getObservedCase: (caseId: string) => controller.getObservedCase(caseId), preparePortfolio: (input: Parameters<NonNullable<typeof api.preparePortfolio>>[0]) => api.preparePortfolio!(input), now: () => new Date().toISOString() };
      const snapshot = source.kind === 'AUTHORED'
        ? await resolvePortfolioSource({ kind: 'AUTHORED', authoredPortfolioId: source.authoredPortfolioId, preparation: await api.preparePortfolio(source.preparation) }, dependencies)
        : await resolvePortfolioSource(source, dependencies);
      save(await updateScenario(study, scenario.id, { sourceSnapshot: snapshot }, new Date().toISOString()));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível preparar a origem.');
    }
  };
  return <StudyEditor study={study} observedCases={cases} companies={companies} status={controller.snapshot.status} error={error} onRename={async (name) => save(await renameStudy(study, name, new Date().toISOString()))} onDuplicate={async () => { const copy = await duplicateStudy(study, new Date().toISOString(), () => crypto.randomUUID()); controller.startNewStudy(); controller.edit(copy); await controller.flush(); navigate(`/estudos/${copy.id}`); }} onSourceChange={applySource} onConvertObserved={() => setError(null)} />;
}
