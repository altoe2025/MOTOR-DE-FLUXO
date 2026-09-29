import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useApiClient, useStudyController } from '../app/providers';
import type { CompanyRecord, FieldProvenance, ObservedCase } from '../cases/domain';
import { isProfileMvpScenario } from '../hypotheses/hypothesis';
import type { Levers } from '../levers/applyLevers';
import { LeverBuilder } from '../levers/LeverBuilder';
import { NEUTRAL_LEVERS } from '../levers/applyLevers';
import { buildLeverScenario, derivationKind, periodCovering } from '../levers/leverScenario';
import { currentDiagnostic } from '../levers/savingsOrigin';
import { applyLeversToCombinationBase, prepareCombinationStudy } from '../levers/prepareCombinationStudy';
import { resolvePortfolioSource } from '../preparation/resolvePortfolioSource';
import { StudyEditor } from '../study/components/StudyEditor';
import type { PortfolioSourceDraft } from '../study/components/PortfolioSourceSelector';
import { appendScenario, appendScenarios, duplicateStudy, removeScenario, renameScenario, renameStudy, updateScenario } from '../study/domain';
import type { ScenarioDocument, ScenarioDraft, StudyDocument } from '../study/model';
import { combinationName, DEFAULT_STUDY_NAME, suggestStudyName, uniqueName, variationName } from '../study/naming';
import { observedVariationLabel } from '../study/observedVariation';
import type { StudyControllerStatus } from '../study/studyController';
import { Button } from '../ui/Button';
import { InlineNotice } from '../ui/InlineNotice';

/** Nome da carteira de uma combinação sem alavancas; com alavancas, o nome as descreve. */
const COMBINATION_BASE_NAME = 'Cenário base';

function sourceLabel(scenario: ScenarioDocument): string {
  if (scenario.sourceSnapshot.source.kind === 'OBSERVED_CASE') return 'Dados observados';
  if (isProfileMvpScenario(scenario)) return 'Simulação baseada em Perfil';
  if (scenario.sourceSnapshot.source.kind === 'SYNTHETIC') return 'Simulação sintética legada';
  return observedVariationLabel(scenario) ?? 'Carteira autoral legada';
}

/** Casos observados por trás da origem escolhida, para sugerir o nome do estudo. */
function casesBehind(source: PortfolioSourceDraft, cases: readonly ObservedCase[]): ObservedCase[] {
  if (source.kind === 'OBSERVED_CASE') return cases.filter((item) => item.id === source.caseId);
  if (source.kind === 'AUTHORED' && source.definition.kind === 'EXPLICIT_ORDERS') {
    const ids = new Set((source.definition.sourceCases ?? []).map((item) => item.caseId));
    return cases.filter((item) => ids.has(item.id));
  }
  return [];
}

function ScenarioItem({ study, scenario, selected, onSelect, onRename, onDiagnose, onDelete }: Readonly<{
  study: StudyDocument;
  scenario: ScenarioDocument;
  selected: boolean;
  onSelect(): void;
  onRename(name: string): Promise<void>;
  onDiagnose(): void;
  onDelete(): void;
}>) {
  const [draft, setDraft] = useState<string | null>(null);
  const isBase = scenario.id === study.baseScenarioId;
  const diagnosed = currentDiagnostic(study, scenario) !== null;
  const submit = async () => {
    if (draft === null) return;
    const name = draft.trim();
    if (name !== '' && name !== scenario.name) await onRename(name);
    setDraft(null);
  };
  return <li>
    {draft === null
      ? <label><input type="radio" name="lever-base" checked={selected} onChange={onSelect} /> <strong>{scenario.name}</strong></label>
      : <form className="scenario-rename" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label>Novo nome<input value={draft} maxLength={120} autoFocus onChange={(event) => setDraft(event.target.value)} /></label>
        <Button type="submit" disabled={draft.trim() === ''}>Salvar</Button>
        <Button variant="secondary" onClick={() => setDraft(null)}>Cancelar</Button>
      </form>}
    <span>{sourceLabel(scenario)}{isBase ? ' · original' : ' · variação'}{diagnosed ? ' · diagnóstico atual' : ' · sem diagnóstico'}</span>
    <Button data-chat-help-id="control.carteira.diagnostico" variant="secondary" onClick={onDiagnose}>{diagnosed ? 'Abrir diagnóstico' : 'Executar diagnóstico'}</Button>
    {draft === null ? <Button variant="secondary" className="button--compact" aria-label={`Renomear cenário ${scenario.name}`} onClick={() => setDraft(scenario.name)}>Renomear</Button> : null}
    {isBase ? null : <Button variant="secondary" className="button--danger" aria-label={`Apagar cenário ${scenario.name}`} onClick={onDelete}>Apagar</Button>}
  </li>;
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
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [combinationProgress, setCombinationProgress] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void Promise.all([controller.loadStudy(id), controller.listObservedCases(), controller.listCompanies()])
      .then(([loaded, observed, companyRecords]) => {
        setStudy(loaded); setCases(observed); setCompanies(companyRecords); setError(null);
        setSelectedBaseId(loaded?.baseScenarioId ?? null);
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
  const combinationStudy = study.studyType === 'PORTFOLIO_COMBINATIONS';
  const save = (next: StudyDocument) => { controller.edit(next); setStudy(next); };
  const persist = async (next: StudyDocument, failure: string) => {
    controller.edit(next);
    setStudy(next);
    const saved = await controller.flush();
    if (saved === null || saved.id !== study.id) throw new Error(failure);
    setStudy(saved);
  };
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
      const horizonDays = snapshot.orders.length === 0 ? 1 : Math.max(...snapshot.orders.map((order) => order.dia_limite)) + 1;
      const now = new Date().toISOString();
      // Na combinação, trocar as empresas volta a carteira ao original: as alavancas aplicadas saem.
      const updated = await updateScenario(study, scenario.id, { sourceSnapshot: snapshot, period: periodCovering(scenario.period, horizonDays),
        ...(combinationStudy ? { name: COMBINATION_BASE_NAME } : {}) }, now);
      save(updated);
      // Estudo ainda com o nome padrão ganha um nome a partir da origem (empresas + período).
      const suggestion = study.name === DEFAULT_STUDY_NAME ? suggestStudyName(casesBehind(source, cases), companies) : null;
      if (suggestion !== null) save(await renameStudy(updated, suggestion, now));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível preparar a origem.');
    }
  };
  const takenNames = () => study.scenarios.map((item) => item.name);
  const applyLeversToBase = async (levers: Levers) => {
    const recordedAt = new Date().toISOString();
    const next = await applyLeversToCombinationBase(study, levers, recordedAt);
    if (next !== study) await persist(next, 'A sessão mudou antes de aplicar a alavanca.');
  };
  const createLeverVariation = async (levers: Levers) => {
    const recordedAt = new Date().toISOString();
    const draft = await buildLeverScenario({
      base: selectedBase, levers, id: crypto.randomUUID(), authoredPortfolioId: crypto.randomUUID(), recordedAt,
      name: uniqueName(variationName(levers, selectedBase.name, selectedBase.id === study.baseScenarioId), takenNames()),
    });
    await persist(await appendScenario(study, draft, recordedAt), 'A sessão mudou antes de salvar a variação.');
  };
  const createCombinations = async (subsets: readonly (readonly string[])[], groups: readonly string[]) => {
    const recordedAt = new Date().toISOString();
    const taken = takenNames();
    const drafts: ScenarioDraft[] = [];
    setCombinationProgress(`Preparando 0 de ${subsets.length} combinações…`);
    try {
      for (const [index, subset] of subsets.entries()) {
        const removed = groups.filter((company) => !subset.includes(company));
        const name = uniqueName(combinationName(subset), taken);
        taken.push(name);
        const draft = await buildLeverScenario({
          base: selectedBase, id: crypto.randomUUID(), authoredPortfolioId: crypto.randomUUID(), recordedAt,
          levers: removed.map((company) => ({ ...NEUTRAL_LEVERS, group: company, removeCompany: true })),
          name,
          derivation: {
            kind: derivationKind(subset, groups), baseScenarioId: selectedBase.id,
            baseSourceFingerprint: selectedBase.sourceSnapshot.sourceFingerprint, companies: [...subset],
          },
        });
        drafts.push(draft);
        if ((index + 1) % 8 === 0 || index + 1 === subsets.length) {
          setCombinationProgress(`Preparando ${index + 1} de ${subsets.length} combinações…`);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }
      if (controller.snapshot.document?.id !== study.id || controller.snapshot.document.revision !== study.revision) {
        throw new Error('O estudo mudou durante a criação. Tente gerar as combinações novamente.');
      }
      setCombinationProgress('Salvando as combinações…');
      const next = await appendScenarios(study, drafts, recordedAt);
      await persist(next, 'A sessão mudou antes de salvar as combinações.');
    } finally {
      setCombinationProgress(null);
    }
  };
  const rename = async (target: ScenarioDocument, name: string) => {
    try {
      const unique = uniqueName(name, takenNames().filter((item) => item !== target.name));
      await persist(await renameScenario(study, target.id, unique, new Date().toISOString()), 'A sessão mudou antes de renomear o cenário.');
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível renomear o cenário.');
    }
  };
  const deleteScenario = async (target: ScenarioDocument) => {
    if (!window.confirm(`Apagar o cenário "${target.name}"?

Os diagnósticos dele também serão apagados. Não dá para desfazer.`)) return;
    try {
      const next = await removeScenario(study, target.id, new Date().toISOString());
      if (selectedBase.id === target.id) setSelectedBaseId(study.baseScenarioId);
      await persist(next, 'A sessão mudou antes de apagar o cenário.');
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
  const diagnosticPath = (target: ScenarioDocument) => {
    const execution = currentDiagnostic(study, target);
    return `/estudos/${study.id}/diagnostico?scenarioId=${target.id}${execution === null ? '' : `&executionId=${execution.id}`}`;
  };
  const diagnoseCombinations = async () => {
    if (combinationProgress !== null) return;
    setCombinationProgress('Preparando combinações…');
    setError(null);
    try {
      await controller.flush();
      const next = await prepareCombinationStudy(study, setCombinationProgress);
      if (controller.snapshot.document?.id !== study.id || controller.snapshot.document.revision !== study.revision) {
        throw new Error('O estudo mudou durante a preparação. Tente novamente.');
      }
      if (next !== study) await persist(next, 'Não foi possível salvar as combinações.');
      navigate(`/estudos/${study.id}/diagnostico?runAll=1`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível preparar as combinações.');
    } finally { setCombinationProgress(null); }
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
  {error === null ? null : <InlineNotice tone="error">{error}</InlineNotice>}
  {combinationStudy ? <>
  <p className="eyebrow">Passo 3</p>
  {scenario.name === COMBINATION_BASE_NAME ? null : <p className="inline-notice" role="status">Alavancas aplicadas à carteira: {scenario.name}</p>}
  <LeverBuilder key={`${scenario.id}:${scenario.sourceSnapshot.sourceFingerprint}`} base={scenario} applyToBase onCreate={applyLeversToBase} />
  <p className="eyebrow">Passo 4</p>
  <section aria-labelledby="combination-diagnosis-title">
    <h2 id="combination-diagnosis-title">Diagnóstico das combinações</h2>
    <p>As combinações são calculadas internamente. O diagnóstico mostra a recomendação e as principais alternativas.</p>
    <Button disabled={combinationProgress !== null} onClick={() => void diagnoseCombinations()}>Diagnosticar combinações</Button>
    {combinationProgress === null ? null : <p role="status">{combinationProgress}</p>}
  </section></> : <>
  <section className="scenario-workspace" aria-labelledby="scenario-list-title">
    <p className="eyebrow">Passo 3</p>
    <h2 id="scenario-list-title">Cenários do estudo</h2>
    <p className="field-hint">O original usa a origem e as premissas acima. Rode o diagnóstico de cada cenário; o cenário marcado é a base das alavancas abaixo.</p>
    <ul className="scenario-list">{study.scenarios.map((item) => <ScenarioItem key={item.id} study={study} scenario={item}
      selected={selectedBase.id === item.id} onSelect={() => setSelectedBaseId(item.id)}
      onRename={(name) => rename(item, name)} onDiagnose={() => void navigateAfterFlush(diagnosticPath(item))}
      onDelete={() => void deleteScenario(item)} />)}</ul>
  </section>
  <p className="eyebrow">Passo 4</p>
  <LeverBuilder key={`${selectedBase.id}:${selectedBase.sourceSnapshot.sourceFingerprint}`} base={selectedBase} progress={combinationProgress} onCreate={createLeverVariation} onCreateCombinations={createCombinations} /></>}</>;
}
