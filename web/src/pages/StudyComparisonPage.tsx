import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useStudyController } from '../app/providers';
import { compareMvpDiagnostics, type MvpComparisonResult } from '../hypotheses/comparison';
import { ScenarioComparison } from '../hypotheses/components/ScenarioComparison';
import { isProfileMvpScenario } from '../hypotheses/hypothesis';
import type { DiagnosticExecutionRecord, ScenarioDocument, StudyDocument } from '../study/model';
import { Button } from '../ui/Button';
import { InlineNotice } from '../ui/InlineNotice';

function current(execution: DiagnosticExecutionRecord, scenario: ScenarioDocument): boolean {
  return execution.scenarioRevision === scenario.revision
    && execution.inputFingerprint === scenario.inputFingerprint;
}

function sourceLabel(scenario: ScenarioDocument | undefined): string | null {
  if (scenario === undefined) return null;
  if (scenario.sourceSnapshot.source.kind === 'OBSERVED_CASE') return 'Dados observados';
  if (isProfileMvpScenario(scenario)) return 'Simulação baseada em Perfil';
  return scenario.sourceSnapshot.source.kind === 'SYNTHETIC'
    ? 'Simulação sintética legada' : 'Carteira autoral legada';
}

export function StudyComparisonPage() {
  const [searchParams] = useSearchParams();
  const studyId = searchParams.get('studyId');
  const controller = useStudyController();
  const heading = useRef<HTMLHeadingElement>(null);
  const [study, setStudy] = useState<StudyDocument | null>(null);
  const [baseId, setBaseId] = useState('');
  const [hypothesisId, setHypothesisId] = useState('');
  const [result, setResult] = useState<MvpComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    heading.current?.focus();
    setStudy(null); setBaseId(''); setHypothesisId(''); setResult(null); setError(null);
    if (studyId === null) { setError('Informe o estudo que será comparado.'); return () => { active = false; }; }
    void controller.loadStudy(studyId).then((loaded) => {
      if (!active) return;
      setStudy(loaded);
      if (loaded === null) setError('O estudo não existe ou pertence a outra conta.');
    }).catch(() => { if (active) setError('Não foi possível abrir o estudo.'); });
    return () => { active = false; };
  }, [controller, studyId]);

  const candidates = study?.executions.filter((item): item is DiagnosticExecutionRecord => {
    if (item.kind !== 'DIAGNOSTIC' || item.status !== 'SUCCEEDED' || item.envelope === null) return false;
    const scenario = study.scenarios.find((candidate) => candidate.id === item.scenarioId);
    return scenario !== undefined && current(item, scenario);
  }) ?? [];
  const base = candidates.filter((item) => item.scenarioId === study?.baseScenarioId);
  const hypotheses = candidates.filter((item) => item.scenarioId !== study?.baseScenarioId);
  const compare = () => {
    const left = base.find((item) => item.id === baseId);
    const right = hypotheses.find((item) => item.id === hypothesisId);
    if (left === undefined || right === undefined) return;
    const next = compareMvpDiagnostics(left, right);
    setResult(next);
    setError(next.ok ? null : next.reason);
  };
  const option = (execution: DiagnosticExecutionRecord) => {
    const scenario = study?.scenarios.find((item) => item.id === execution.scenarioId);
    return <option key={execution.id} value={execution.id}>{scenario?.name ?? execution.scenarioId} · {execution.attemptId}</option>;
  };
  return <article className="comparison-page">
    <p className="eyebrow">Estudo {study?.name ?? ''}</p>
    <h1 ref={heading} tabIndex={-1}>Comparar cenários</h1>
    <p className="page-introduction">Escolha explicitamente uma execução diagnóstica atual da base e uma da hipótese.</p>
    {study === null ? null : <p className="source-badge">{sourceLabel(study.scenarios.find((item) => item.id === study.baseScenarioId))}</p>}
    {error === null ? null : <InlineNotice tone="error">{error}</InlineNotice>}
    {study === null ? null : <section className="comparison-selector" aria-labelledby="comparison-selector-title">
      <h2 id="comparison-selector-title">Execuções</h2>
      <label>Execução base<select value={baseId} onChange={(event) => { setBaseId(event.target.value); setResult(null); }}><option value="">Selecione</option>{base.map(option)}</select></label>
      <label>Execução da hipótese<select value={hypothesisId} onChange={(event) => { setHypothesisId(event.target.value); setResult(null); }}><option value="">Selecione</option>{hypotheses.map(option)}</select></label>
      <Button disabled={baseId === '' || hypothesisId === '' || baseId === hypothesisId} onClick={compare}>Comparar</Button>
    </section>}
    {result?.ok === true ? <ScenarioComparison comparison={result.value} /> : null}
  </article>;
}
