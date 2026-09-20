import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useApiClient, useStudyController } from '../app/providers';
import type { CompanyRecord, FieldProvenance, ObservedCase } from '../cases/domain';
import { buildPreviewRequest, type PreviewRequestProvenance } from '../preparation/buildPreviewRequest';
import { resolvePortfolioSource } from '../preparation/resolvePortfolioSource';
import { StudyEditor } from '../study/components/StudyEditor';
import type { PortfolioSourceDraft } from '../study/components/PortfolioSourceSelector';
import { duplicateStudy, renameStudy, updateScenario } from '../study/domain';
import { executeStudyScenario } from '../study/executionService';
import type { ExecutionRecord, ScenarioDocument, StudyDocument } from '../study/model';
import type { StudyControllerStatus } from '../study/studyController';
import { Button } from '../ui/Button';
import { StudyResultPage } from './StudyResultPage';

function executionProvenance(study: StudyDocument, scenario: ScenarioDocument): PreviewRequestProvenance {
  const defaults: FieldProvenance = {
    kind: 'SYNTHETIC_DEFAULT',
    source: 'configuração inicial do estudo',
    version: study.schemaVersion,
    recordedAt: study.createdAt,
    rule: 'study-defaults-v1',
  };
  const costs = {
    iof_out: defaults, iof_in: defaults, carry_cnr: defaults,
    custo_fixo_remessa: defaults, custo_oportunidade_aa: defaults,
    spread_rail_bps: defaults, ptax: defaults,
  };
  return scenario.inputProvenance
    ?? { premises: { windowDays: defaults, costs }, period: { horizonDays: defaults } };
}

export function StudyPortfolioPage() {
  const { id } = useParams();
  const controller = useStudyController();
  const api = useApiClient();
  const navigate = useNavigate();
  const [study, setStudy] = useState<StudyDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState<ObservedCase[]>([]);
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [status, setStatus] = useState<StudyControllerStatus>(controller.snapshot.status);
  const [selectedExecution, setSelectedExecution] = useState<ExecutionRecord | null>(null);
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    if (!id) return;
    void Promise.all([controller.loadStudy(id), controller.listObservedCases(), controller.listCompanies()])
      .then(([loaded, observed, companyRecords]) => {
        setStudy(loaded); setCases(observed); setCompanies(companyRecords); setError(null);
        setSelectedExecution(loaded === null ? null : [...loaded.executions].reverse().find((item) => item.status === 'SUCCEEDED') ?? null);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o estudo.'));
    return controller.subscribe(() => {
      setStudy(controller.snapshot.document);
      setStatus(controller.snapshot.status);
    });
  }, [controller, id]);

  if (study === null) return <article className="destination-page"><h1 tabIndex={-1}>Estudo não encontrado</h1><p>{error ?? 'O estudo pode ter sido removido ou pertencer a outra conta.'}</p></article>;
  const scenario = study.scenarios.find((item) => item.id === study.baseScenarioId);
  if (scenario === undefined) throw new Error('Estudo sem cenário base.');
  const save = (next: StudyDocument) => { controller.edit(next); setStudy(next); };
  const displayedExecution = selectedExecution
    ?? [...study.executions].reverse().find((item) => item.status === 'SUCCEEDED')
    ?? null;
  const applySource = async (source: PortfolioSourceDraft) => {
    try {
      if (api.preparePortfolio === undefined) throw new Error('A preparação de carteira não está disponível.');
      const dependencies = { getObservedCase: (caseId: string) => controller.getObservedCase(caseId), preparePortfolio: (input: Parameters<NonNullable<typeof api.preparePortfolio>>[0]) => api.preparePortfolio!(input), now: () => new Date().toISOString() };
      const snapshot = source.kind === 'AUTHORED'
        ? source.definition.kind === 'EXPLICIT_ORDERS'
          ? await resolvePortfolioSource({
              kind: 'AUTHORED',
              authoredPortfolioId: source.authoredPortfolioId,
              definition: source.definition,
            }, dependencies)
          : await resolvePortfolioSource({
              ...source,
              preparation: await api.preparePortfolio(source.preparation!),
            }, dependencies)
        : await resolvePortfolioSource(source, dependencies);
      save(await updateScenario(study, scenario.id, { sourceSnapshot: snapshot }, new Date().toISOString()));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível preparar a origem.');
    }
  };
  const execute = async () => {
    setExecuting(true);
    setError(null);
    try {
      const result = await executeStudyScenario({
        controller,
        scenarioId: scenario.id,
        buildRequest: (context) => buildPreviewRequest(
          context.scenario.sourceSnapshot,
          context.scenario.premises,
          context.scenario.period,
          {
            requestId: context.requestId,
            studyId: context.study.id,
            scenarioId: context.scenario.id,
            scenarioRevision: context.scenario.revision,
          },
          executionProvenance(context.study, context.scenario),
        ),
        runPreview: (input, signal) => api.runPreview(input, signal),
      });
      const current = controller.snapshot.document;
      if (current !== null) setStudy(current);
      const terminal = current === null
        ? null
        : [...current.executions].reverse().find((item) => item.status === 'SUCCEEDED') ?? null;
      if (terminal !== null) setSelectedExecution(terminal);
      if (result.persistenceError instanceof Error) {
        setError(result.persistenceError.message);
      } else if (result.status !== 'SUCCEEDED') {
        setError(result.error instanceof Error ? result.error.message : 'A execução não foi concluída.');
      }
    } finally {
      setExecuting(false);
    }
  };
  return <><StudyEditor study={study} observedCases={cases} companies={companies} status={status} error={error} onRename={async (name) => save(await renameStudy(study, name, new Date().toISOString()))} onDuplicate={async () => { const copy = await duplicateStudy(study, new Date().toISOString(), () => crypto.randomUUID()); controller.startNewStudy(); controller.edit(copy); await controller.flush(); navigate(`/estudos/${copy.id}`); }} onSourceChange={applySource} onConvertObserved={() => setError(null)} onScenarioChange={async (update) => {
    const recordedAt = new Date().toISOString();
    const authored: FieldProvenance = {
      kind: 'USER_ESTIMATE', source: 'editor de premissas', version: study.schemaVersion,
      recordedAt,
    };
    const inputProvenance = {
      premises: {
        windowDays: authored,
        costs: {
          iof_out: authored, iof_in: authored, carry_cnr: authored,
          custo_fixo_remessa: authored, custo_oportunidade_aa: authored,
          spread_rail_bps: authored, ptax: authored,
        },
      },
      period: { horizonDays: authored },
    };
    save(await updateScenario(study, scenario.id, { ...update, inputProvenance }, recordedAt));
  }} /><section className="source-actions" aria-label="Execução do cenário"><Button disabled={executing} onClick={() => void execute()}>{executing ? 'Executando cenário…' : 'Executar cenário atual'}</Button></section>{displayedExecution === null ? null : <StudyResultPage study={study} execution={displayedExecution} onSelectExecution={setSelectedExecution} />}</>;
}
