import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useApiClient, useStudyController } from '../app/providers';
import type { PreparationRequest } from '../api/client';
import { validatePreparationRequest } from '../api/validators';
import type { CompanyRecord, FieldProvenance, ObservedCase } from '../cases/domain';
import { HypothesisBuilder } from '../hypotheses/components/HypothesisBuilder';
import type { Levers } from '../levers/applyLevers';
import { LeverBuilder } from '../levers/LeverBuilder';
import { buildLeverScenario } from '../levers/leverScenario';
import { PortfolioCompositionSummary } from '../hypotheses/components/PortfolioCompositionSummary';
import { ProfileScenarioBuilder } from '../hypotheses/components/ProfileScenarioBuilder';
import {
  buildCompositionScenarioDraft,
  buildCompositionSourceSnapshot,
  materializeCompositionDraft,
  type CompositionHypothesisDraft,
} from '../hypotheses/composition';
import {
  applyProfileHypothesis,
  buildHypothesisScenarioDraft,
  isProfileMvpScenario,
  PROFILE_MVP_EXAMPLE_ID,
  type MvpHypothesisDraft,
} from '../hypotheses/hypothesis';
import {
  buildProfileMvpPreparationRequest,
  type ProfileMvpParticipantDraft,
} from '../hypotheses/profileMvp';
import type { OperationalProfileVersion } from '../profiles/domain';
import { buildPreviewRequest, type PreviewRequestProvenance } from '../preparation/buildPreviewRequest';
import { resolvePortfolioSource } from '../preparation/resolvePortfolioSource';
import { StudyEditor } from '../study/components/StudyEditor';
import type { PortfolioSourceDraft } from '../study/components/PortfolioSourceSelector';
import { appendCompositionHypothesis, appendScenario, createProfileStudy, duplicateStudy, removeScenario, renameStudy, updateScenario } from '../study/domain';
import { executeStudyScenario } from '../study/executionService';
import type { DeepMutable, EffectiveInput, ExecutionRecord, PreviewExecutionRecord, ScenarioDocument, ScenarioDraft, StudyDocument } from '../study/model';
import { requiredBuildSha } from '../study/sourceConfiguration';
import type { StudyControllerStatus } from '../study/studyController';
import { Button } from '../ui/Button';
import { InlineNotice } from '../ui/InlineNotice';
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

function periodHorizon(scenario: ScenarioDocument): number {
  if (scenario.period.httpPeriod.modo === 'NATURAL') {
    return scenario.period.httpPeriod.periodo_medicao_dias;
  }
  if (!('executableHorizonDays' in scenario.period)) throw new Error('Horizonte executável ausente.');
  return scenario.period.executableHorizonDays;
}

function generationChanged(draft: MvpHypothesisDraft): boolean {
  return draft.kind === 'PROFILE_SIMULATION'
    && (draft.volumeMultiplier !== '1' || draft.ticketMultiplier !== '1'
      || draft.outFractionDelta !== '0' || draft.deadline.mode !== 'KEEP');
}

function profileHypothesisRequest(
  study: StudyDocument,
  base: ScenarioDocument,
  draft: Extract<MvpHypothesisDraft, { kind: 'PROFILE_SIMULATION' }>,
  scenarioId: string,
  recordedAt: string,
): PreparationRequest {
  if (!isProfileMvpScenario(base)
      || base.sourceSnapshot.source.kind !== 'SYNTHETIC'
      || base.sourceSnapshot.generationInputSnapshot === undefined) {
    throw new Error('VERSAO_INCOMPATIVEL: a base não contém recipe e entrada de geração por Perfil.');
  }
  if (base.sourceSnapshot.source.recipe.preparationVersion !== '1.0.0') {
    throw new Error('VERSAO_INCOMPATIVEL: versão da preparação não suportada.');
  }
  const request: PreparationRequest = {
    preparation_version: '1.0.0',
    request_id: crypto.randomUUID(),
    study_id: study.id,
    scenario_id: scenarioId,
    scenario_revision: 1,
    expected_build_sha: requiredBuildSha(undefined, base.sourceSnapshot.source.recipe.motorBuildSha),
    input: structuredClone(applyProfileHypothesis(
      base.sourceSnapshot.generationInputSnapshot, draft, recordedAt,
    )) as DeepMutable<EffectiveInput>,
  };
  if (!validatePreparationRequest(request)) throw new Error('Request de hipótese por Perfil inválido.');
  return request;
}

function sourceLabel(scenario: ScenarioDocument): string {
  if (scenario.sourceSnapshot.source.kind === 'OBSERVED_CASE') return 'Dados observados';
  if (isProfileMvpScenario(scenario)) return 'Simulação baseada em Perfil';
  if (scenario.sourceSnapshot.source.kind === 'SYNTHETIC') return 'Simulação sintética legada';
  return 'Carteira autoral legada';
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
  const [availableProfiles, setAvailableProfiles] = useState<OperationalProfileVersion[]>([]);
  const [status, setStatus] = useState<StudyControllerStatus>(controller.snapshot.status);
  const [selectedExecution, setSelectedExecution] = useState<ExecutionRecord | null>(null);
  const [executing, setExecuting] = useState(false);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [pendingHypothesisId, setPendingHypothesisId] = useState<string | null>(null);
  const hypothesisAnchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    void Promise.all([
      controller.loadStudy(id), controller.listObservedCases(), controller.listCompanies(),
      controller.listOperationalProfileVersions(),
    ])
      .then(([loaded, observed, companyRecords, profiles]) => {
        setStudy(loaded); setCases(observed); setCompanies(companyRecords); setError(null);
        setAvailableProfiles(profiles);
        setSelectedBaseId(loaded?.baseScenarioId ?? null);
        setSelectedExecution(loaded === null ? null : [...loaded.executions].reverse().find((item): item is PreviewExecutionRecord => item.kind === 'PREVIEW' && item.status === 'SUCCEEDED') ?? null);
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
  const selectedBase = study.scenarios.find((item) => item.id === selectedBaseId) ?? scenario;
  const attachedProfiles = study.evidenceSnapshots.map((item) => item.profile);
  const save = (next: StudyDocument) => { controller.edit(next); setStudy(next); };
  const displayedExecution = selectedExecution
    ?? [...study.executions].reverse().find((item): item is PreviewExecutionRecord => item.kind === 'PREVIEW' && item.status === 'SUCCEEDED')
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
        : [...current.executions].reverse().find((item): item is PreviewExecutionRecord => item.kind === 'PREVIEW' && item.status === 'SUCCEEDED') ?? null;
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
  const prepareDependencies = () => {
    if (api.preparePortfolio === undefined) throw new Error('A preparação de carteira não está disponível.');
    return {
      getObservedCase: (caseId: string) => controller.getObservedCase(caseId),
      preparePortfolio: (input: PreparationRequest) => api.preparePortfolio!(input),
      now: () => new Date().toISOString(),
    };
  };
  const createProfileSimulation = async (
    participants: readonly ProfileMvpParticipantDraft[],
    profiles: readonly OperationalProfileVersion[],
  ) => {
    const before = JSON.stringify(study);
    const recordedAt = new Date().toISOString();
    const studyId = crypto.randomUUID();
    const scenarioId = crypto.randomUUID();
    const request = buildProfileMvpPreparationRequest({
      identity: { studyId, scenarioId, scenarioRevision: 1 }, scenario,
      participants, requestId: crypto.randomUUID(),
      expectedBuildSha: requiredBuildSha(import.meta.env.VITE_MOTOR_BUILD_SHA, undefined),
      recordedAt,
    });
    const snapshot = await resolvePortfolioSource({
      kind: 'SYNTHETIC', exampleId: PROFILE_MVP_EXAMPLE_ID, preparation: request,
    }, prepareDependencies());
    const baseScenario: ScenarioDraft = {
      id: scenarioId, revision: 1, name: 'Cenário base por Perfil', sourceSnapshot: snapshot,
      premises: structuredClone(scenario.premises), period: structuredClone(scenario.period),
      ...(scenario.inputProvenance === undefined ? {} : { inputProvenance: structuredClone(scenario.inputProvenance) }),
    };
    const created = await createProfileStudy({
      id: studyId, ownerSub: study.ownerSub, name: `${study.name} — simulação por Perfil`,
      baseScenario, profiles, now: recordedAt,
    });
    const saved = await controller.saveDetachedStudy(created, 0);
    if (saved === null) throw new Error('A sessão mudou antes de salvar a simulação.');
    if (JSON.stringify(study) !== before) throw new Error('O estudo observado foi alterado durante a preparação.');
    navigate(`/carteira/${saved.id}`);
  };
  const createHypothesis = async (draft: MvpHypothesisDraft | CompositionHypothesisDraft) => {
    if (pendingHypothesisId !== null) {
      const retried = await controller.flush();
      if (retried === null || retried.id !== study.id) throw new Error('A sessão mudou antes de salvar a hipótese.');
      setPendingHypothesisId(null);
      setStudy(retried);
      navigate(`/estudos/${retried.id}/diagnostico?scenarioId=${pendingHypothesisId}`);
      return;
    }
    const hypothesisId = crypto.randomUUID();
    const recordedAt = new Date().toISOString();
    if (draft.kind === 'PROFILE_COMPOSITION') {
      const materialized = await materializeCompositionDraft({
        base: selectedBase, evidenceProfiles: availableProfiles, draft, recordedAt,
      });
      let compositionSnapshot;
      if (materialized.requiresPreparation) {
        if (selectedBase.sourceSnapshot.source.kind !== 'SYNTHETIC') {
          throw new Error('Hipótese de composição exige origem sintética por Perfil.');
        }
        if (selectedBase.sourceSnapshot.source.recipe.preparationVersion !== '1.0.0') {
          throw new Error('VERSAO_INCOMPATIVEL: versão da preparação não suportada.');
        }
        const request: PreparationRequest = {
          preparation_version: '1.0.0',
          request_id: crypto.randomUUID(), study_id: study.id, scenario_id: hypothesisId,
          scenario_revision: 1,
          expected_build_sha: requiredBuildSha(undefined, selectedBase.sourceSnapshot.source.recipe.motorBuildSha),
          input: structuredClone(materialized.input) as DeepMutable<EffectiveInput>,
        };
        if (!validatePreparationRequest(request)) throw new Error('Request de composição inválido.');
        compositionSnapshot = await resolvePortfolioSource({
          kind: 'SYNTHETIC', exampleId: PROFILE_MVP_EXAMPLE_ID, preparation: request,
        }, prepareDependencies());
      } else {
        compositionSnapshot = await buildCompositionSourceSnapshot(
          selectedBase.sourceSnapshot, materialized, recordedAt,
        );
      }
      const hypothesis = buildCompositionScenarioDraft({
        base: selectedBase, hypothesis: draft, sourceSnapshot: compositionSnapshot,
        id: hypothesisId, recordedAt,
      });
      const next = await appendCompositionHypothesis(study, {
        scenario: hypothesis, profiles: materialized.profilesToAttach, recordedAt,
      });
      controller.edit(next); setStudy(next); setPendingHypothesisId(hypothesisId);
      const saved = await controller.flush();
      if (saved === null || saved.id !== study.id) throw new Error('A sessão mudou antes de salvar a hipótese.');
      setPendingHypothesisId(null); setStudy(saved);
      navigate(`/estudos/${saved.id}/diagnostico?scenarioId=${hypothesisId}`);
      return;
    }
    let sourceSnapshot = structuredClone(selectedBase.sourceSnapshot);
    if (generationChanged(draft)) {
      if (draft.kind !== 'PROFILE_SIMULATION') throw new Error('Hipótese incompatível com a origem.');
      const request = profileHypothesisRequest(study, selectedBase, draft, hypothesisId, recordedAt);
      sourceSnapshot = await resolvePortfolioSource({
        kind: 'SYNTHETIC', exampleId: PROFILE_MVP_EXAMPLE_ID, preparation: request,
      }, prepareDependencies());
    }
    const hypothesis = buildHypothesisScenarioDraft({
      base: selectedBase, draft, sourceSnapshot, id: hypothesisId, recordedAt,
    });
    const next = await appendScenario(study, hypothesis, recordedAt);
    controller.edit(next);
    setStudy(next);
    setPendingHypothesisId(hypothesisId);
    const saved = await controller.flush();
    if (saved === null || saved.id !== study.id) throw new Error('A sessão mudou antes de salvar a hipótese.');
    setPendingHypothesisId(null);
    setStudy(saved);
    navigate(`/estudos/${saved.id}/diagnostico?scenarioId=${hypothesisId}`);
  };
  const createLeverVariation = async (levers: Levers) => {
    const recordedAt = new Date().toISOString();
    const draft = await buildLeverScenario({
      base: selectedBase, levers, id: crypto.randomUUID(), authoredPortfolioId: crypto.randomUUID(), recordedAt,
    });
    const next = await appendScenario(study, draft, recordedAt);
    controller.edit(next);
    setStudy(next);
    const saved = await controller.flush();
    if (saved === null || saved.id !== study.id) throw new Error('A sessão mudou antes de salvar a variação.');
    setStudy(saved);
  };
  const deleteScenario = async (target: ScenarioDocument) => {
    if (!window.confirm(`Apagar o cenário "${target.name}"?

Os diagnósticos dele também serão apagados. Não dá para desfazer.`)) return;
    try {
      const next = await removeScenario(study, target.id, new Date().toISOString());
      if (selectedBase.id === target.id) setSelectedBaseId(study.baseScenarioId);
      controller.edit(next);
      setStudy(next);
      const saved = await controller.flush();
      if (saved === null || saved.id !== study.id) throw new Error('A sessão mudou antes de apagar o cenário.');
      setStudy(saved);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível apagar o cenário.');
    }
  };
  const navigateAfterFlush = async (path: string) => {
    try {
      const saved = await controller.flush();
      if (saved === null || saved.id !== study.id) throw new Error('Não foi possível confirmar a gravação do estudo.');
      navigate(path);
    } catch (reason) {
      setError(reason instanceof Error ? `${reason.message} Tente novamente.` : 'Não foi possível salvar antes de navegar.');
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
  }} />
  <section className="source-actions" aria-label="Execução do cenário"><Button disabled={executing} onClick={() => void execute()}>{executing ? 'Executando cenário…' : 'Executar cenário atual'}</Button></section>
  {error === null ? null : <InlineNotice tone="error">{error}</InlineNotice>}
  <ProfileScenarioBuilder profiles={attachedProfiles} ownerSub={study.ownerSub} horizonDays={periodHorizon(scenario)} onPrepare={createProfileSimulation} />
  <section className="scenario-workspace" aria-labelledby="scenario-list-title">
    <h2 id="scenario-list-title">Cenários do estudo</h2>
    <ul className="scenario-list">{study.scenarios.map((item) => <li key={item.id}>
      <label><input type="radio" name="hypothesis-base" checked={selectedBase.id === item.id} onChange={() => setSelectedBaseId(item.id)} /> <strong>{item.name}</strong></label>
      <span>{sourceLabel(item)}{item.id === study.baseScenarioId ? ' · base' : ' · hipótese'}</span>
      <Button variant="secondary" onClick={() => void navigateAfterFlush(`/estudos/${study.id}/diagnostico?scenarioId=${item.id}`)}>Executar diagnóstico</Button>
      {item.id === study.baseScenarioId ? null : <Button variant="secondary" className="button--danger" aria-label={`Apagar cenário ${item.name}`} onClick={() => void deleteScenario(item)}>Apagar</Button>}
    </li>)}</ul>
    <PortfolioCompositionSummary scenario={selectedBase} profiles={[...availableProfiles, ...attachedProfiles]} companies={companies} onEdit={() => {
      hypothesisAnchor.current?.focus();
      hypothesisAnchor.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    }} />
    <Button variant="secondary" onClick={() => void navigateAfterFlush(`/comparar?studyId=${study.id}`)}>Comparar resultados</Button>
  </section>
  <LeverBuilder key={`${selectedBase.id}:${selectedBase.sourceSnapshot.sourceFingerprint}`} base={selectedBase} onCreate={createLeverVariation} />
  <div ref={hypothesisAnchor} id="composition-editor" tabIndex={-1} aria-label="Editor de hipóteses">
    <HypothesisBuilder key={selectedBase.id} baseScenario={selectedBase}
      availableProfiles={availableProfiles} companies={companies} onCreate={createHypothesis} />
  </div>
  {displayedExecution === null ? null : <StudyResultPage study={study} execution={displayedExecution} />}</>;
}
