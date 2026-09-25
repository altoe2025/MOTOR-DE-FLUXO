import { validateReplayDocument } from '../api/validators';
import { compareCompositionInputs, hasCanonicalComparisonMetricIdentity, mvpDiagnosticIncompatibility, type MvpComparison } from '../hypotheses/comparison';
import { deepFreeze, PROFILE_MVP_EXAMPLE_ID } from '../study/domain';
import { isCertifiedStudy } from '../study/certifiedStudy';
import { canonical } from '../study/fingerprints';
import type { DiagnosticEnvelope, DiagnosticExecutionRecord, StudyDocument } from '../study/model';
import { assertValidStudy } from '../study/validation';
import type { ReplayDocument } from '../replay/domain';
import type { CommunicationDocumentV1, CommunicationEvidence, CommunicationFact, CommunicationMetric, CommunicationSection } from './domain';
import { fingerprintCommunicationDocument } from './evidence';
import { assertValidCommunicationDocument } from './validation';

export type CommunicationComparisonInput = Readonly<{
  baseExecutionId: string;
  hypothesisExecutionId: string;
  value: MvpComparison;
}>;
export type CommunicationInput = Readonly<{
  study: StudyDocument;
  scenarioId: string;
  diagnosticExecutionId: string;
  /** The other diagnostic execution, not an invented comparison record ID. */
  comparisonExecutionId: string | null;
  comparison?: CommunicationComparisonInput | null;
  replay: ReplayDocument | null;
  replayDay: number | null;
  /** Defaults to study.updatedAt; the projection never reads a clock. */
  generatedAt?: string;
}>;

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function pointer(root: unknown, path: string): unknown {
  requireCondition(path.startsWith('/'), 'Caminho de evidência inválido.');
  return path.slice(1).split('/').reduce<unknown>((node, encoded) => {
    const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    requireCondition(node !== null && typeof node === 'object' && Object.hasOwn(node, key), `Evidência ausente: ${path}`);
    return (node as Record<string, unknown>)[key];
  }, root);
}
function text(value: unknown): string | null {
  return value === null ? null : typeof value === 'string' ? value : canonical(value);
}
function diagnostic(study: StudyDocument, id: string): DiagnosticExecutionRecord & { envelope: DiagnosticEnvelope } {
  const execution = study.executions.find((item) => item.id === id);
  requireCondition(execution?.kind === 'DIAGNOSTIC' && execution.status === 'SUCCEEDED'
    && execution.envelope !== null, 'Execução diagnóstica concluída ausente.');
  const envelope = execution.envelope;
  const selectedId = envelope.statistics.selected_repetition_id;
  const summary = envelope.repetitions.filter((item) => item.repetition_id === selectedId);
  requireCondition(selectedId === envelope.selected_execution.statistics.repetition_id
    && selectedId === execution.requestSnapshot.selected_repetition_id
    && summary.length === 1
    && summary[0]!.execution_fingerprint === envelope.selected_execution.execution_fingerprint
    && new Set(envelope.repetitions.map((item) => item.repetition_id)).size === envelope.repetitions.length
    && envelope.repetitions.length === envelope.statistics.count
    && envelope.statistics.count === execution.requestSnapshot.sampling.count, 'Repetição incompatível com a publicação selecionada.');
  return execution as DiagnosticExecutionRecord & { envelope: DiagnosticEnvelope };
}
function validatePublishedReferences(envelope: DiagnosticEnvelope): void {
  const selected = envelope.repetitions.findIndex((item) => item.repetition_id === envelope.statistics.selected_repetition_id);
  function check(path: string): void {
    const concrete = path.replace('/repetitions/selected/', `/repetitions/${selected}/`);
    if (concrete.startsWith('/repetitions/*/')) {
      for (const index of envelope.repetitions.keys()) pointer(envelope, concrete.replace('/*/', `/${index}/`));
    } else pointer(envelope, concrete);
  }
  function visit(value: unknown): void {
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'evidence' || key === 'evidence_refs') {
        requireCondition(Array.isArray(child) && new Set(child).size === child.length, 'Referência de evidência duplicada.');
        for (const path of child as string[]) check(path);
      } else visit(child);
    }
  }
  visit(envelope.axes);
  visit(envelope.limitations);
  visit(envelope.consequences);
  const provenanceRefs = envelope.provenance.evidence_refs;
  requireCondition(new Set(provenanceRefs).size === provenanceRefs.length, 'Referência de proveniência duplicada.');
  for (const path of provenanceRefs) requireCondition(Object.hasOwn(envelope.provenance.request_paths, path), `Proveniência ausente: ${path}`);
}
function sourceFamily(execution: DiagnosticExecutionRecord): CommunicationDocumentV1['source'] {
  const snapshot = execution.sourceSnapshot;
  if (snapshot.source.kind === 'OBSERVED_CASE') return {
    family: 'OBSERVED', label: 'Caso observado — resultado simulado sob as premissas informadas', synthetic: false,
  };
  const generation = snapshot.generationInputSnapshot;
  requireCondition(snapshot.source.kind === 'SYNTHETIC' && snapshot.source.recipe.exampleId === PROFILE_MVP_EXAMPLE_ID
    && generation !== undefined && generation.participants.length > 0
    && generation.participants.every((participant) => /^profile-mvp:.+@[0-9a-f]{64}:(derived|hypothesis)$/.test(
      generation.sources[`/participants/${participant.id}/profile`]?.source ?? '',
    )), 'Família de origem sem linhagem de Perfil suportada.');
  return { family: 'PROFILE_SIMULATION', label: 'Simulação por Perfil — hipótese sintética não calibrada', synthetic: true };
}
async function sha256(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function sameDecimal(left: string, right: string): boolean {
  // Representational equality only; never round or change a projected value.
  const normalize = (value: string) => value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '').replace(/^-0$/, '0');
  return normalize(left) === normalize(right);
}
async function checkReplay(input: CommunicationInput, execution: DiagnosticExecutionRecord & { envelope: DiagnosticEnvelope }): Promise<void> {
  const replay = input.replay;
  if (replay === null) { requireCondition(input.replayDay === null, 'Dia selecionado sem Replay.'); return; }
  const envelope = execution.envelope;
  const preview = envelope.selected_execution;
  const repetition = envelope.repetitions.find((item) => item.repetition_id === envelope.statistics.selected_repetition_id)!;
  requireCondition(validateReplayDocument(replay) && replay.diagnostic_execution_id === execution.id
    && replay.scenario_id === execution.scenarioId && replay.scenario_revision === execution.scenarioRevision
    && replay.repetition_id === repetition.repetition_id && replay.execution_fingerprint === preview.execution_fingerprint
    && replay.result_fingerprint === await sha256(preview.result) && replay.motor_version === preview.result.manifesto.versao_motor
    && canonical(replay.participant_seeds) === canonical(repetition.participant_seeds), 'Replay incompatível com o contexto selecionado.');
  requireCondition(input.replayDay !== null && Number.isInteger(input.replayDay)
    && replay.days[input.replayDay]?.day === input.replayDay, 'Dia de Replay inválido.');
  const aggregate = preview.result.agregado;
  const totals = replay.totals;
  requireCondition(sameDecimal(totals.measured_gross_brl, aggregate.volume_bruto_periodo_brl)
    && sameDecimal(totals.measured_matched_contribution_brl, aggregate.volume_casado_periodo_brl)
    && sameDecimal(totals.measured_autonetting_contribution_brl, aggregate.volume_autonetting_periodo_brl)
    && sameDecimal(totals.measured_multilateral_contribution_brl, aggregate.volume_netting_multilateral_periodo_brl)
    && sameDecimal(totals.measured_remitted_brl, aggregate.volume_remetido_periodo_brl)
    && sameDecimal(totals.netability_fraction, aggregate.taxa_netabilidade_periodo), 'Replay com totais divergentes.');
}
function checkComparison(input: CommunicationInput, selected: DiagnosticExecutionRecord): void {
  const comparison = input.comparison;
  if (input.comparisonExecutionId === null) {
    requireCondition(comparison === undefined || comparison === null, 'Comparação sem seleção.'); return;
  }
  requireCondition(comparison !== undefined && comparison !== null, 'Comparação calculada ausente.');
  requireCondition(input.comparisonExecutionId !== selected.id
    && new Set([comparison.baseExecutionId, comparison.hypothesisExecutionId]).size === 2
    && [comparison.baseExecutionId, comparison.hypothesisExecutionId].includes(selected.id)
    && [comparison.baseExecutionId, comparison.hypothesisExecutionId].includes(input.comparisonExecutionId), 'Identidade da comparação incompatível.');
  const base = diagnostic(input.study, comparison.baseExecutionId);
  const hypothesis = diagnostic(input.study, comparison.hypothesisExecutionId);
  requireCondition(mvpDiagnosticIncompatibility(base, hypothesis) === null, 'Comparação entre execuções incompatíveis.');
  const baseInput = base.sourceSnapshot.generationInputSnapshot;
  const hypothesisInput = hypothesis.sourceSnapshot.generationInputSnapshot;
  if (baseInput !== undefined && hypothesisInput !== undefined) {
    const compatibility = compareCompositionInputs(baseInput, hypothesisInput);
    requireCondition(compatibility.status === 'COMPARABLE'
      && canonical(compatibility) === canonical(comparison.value.compatibility), 'Composição incompatível.');
  } else requireCondition(canonical(base.sourceSnapshot.source) === canonical(hypothesis.sourceSnapshot.source)
    && canonical(base.sourceSnapshot.orders) === canonical(hypothesis.sourceSnapshot.orders)
    && canonical(base.sourceSnapshot.provenanceByOrder ?? null) === canonical(hypothesis.sourceSnapshot.provenanceByOrder ?? null), 'Casos observados incompatíveis.');
  requireCondition(comparison.value.compatibility.status === 'COMPARABLE' && comparison.value.compatibility.blockers.length === 0, 'Comparação incompatível.');
  const codes = new Set<string>();
  for (const row of comparison.value.axes) {
    requireCondition(hasCanonicalComparisonMetricIdentity(row), 'Métrica de comparação com identidade, rótulo ou unidade incompatível.');
    const code = `${row.axis}.${row.metric}`;
    requireCondition(!codes.has(code), 'Métrica de comparação duplicada.'); codes.add(code);
    const [name, percentile] = row.metric.split('.');
    const path = `/axes/${row.axis.toLowerCase()}/${name}`;
    const left = pointer(base.envelope, path) as { state: string; value?: unknown };
    const right = pointer(hypothesis.envelope, path) as { state: string; value?: unknown };
    const available = left.state === 'AVAILABLE' && right.state === 'AVAILABLE';
    requireCondition(available ? row.state === 'AVAILABLE'
      && row.base === (percentile === undefined ? left.value : pointer(left.value, `/${percentile}`))
      && row.hypothesis === (percentile === undefined ? right.value : pointer(right.value, `/${percentile}`)) && row.delta !== null
      : row.state === 'UNAVAILABLE' && row.base === null && row.hypothesis === null && row.delta === null,
    'Valores da comparação divergem das fontes.');
  }
}

/** Pure projection: async only for validation/hashing; no I/O or financial arithmetic. */
export async function buildCommunicationDocument(input: CommunicationInput): Promise<CommunicationDocumentV1> {
  performance.clearMarks('mot97:communication:start');
  performance.mark('mot97:communication:start');
  const { study, ...otherInput } = input;
  const certified = isCertifiedStudy(study, study.ownerSub);
  input = { ...structuredClone(otherInput), study: certified ? study : structuredClone(study) }; // Detach before the first await.
  performance.clearMarks('mot97:communication:snapshot');
  performance.mark('mot97:communication:snapshot');
  // Give paint and input a task boundary between independent validation stages.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (!certified) await assertValidStudy(input.study);
  performance.clearMarks('mot97:communication:study-validated');
  performance.mark('mot97:communication:study-validated');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const execution = diagnostic(input.study, input.diagnosticExecutionId);
  requireCondition(execution.scenarioId === input.scenarioId, 'Cenário diverge da execução selecionada.');
  const envelope = execution.envelope;
  validatePublishedReferences(envelope);
  const source = sourceFamily(execution);
  checkComparison(input, execution);
  await checkReplay(input, execution);
  const executionPath = `/executions/${input.study.executions.findIndex((item) => item.id === execution.id)}`;
  const selection = { scenarioId: execution.scenarioId, scenarioRevision: execution.scenarioRevision,
    diagnosticExecutionId: execution.id, repetitionId: envelope.statistics.selected_repetition_id,
    comparisonExecutionId: input.comparisonExecutionId, replayDay: input.replayDay };
  const evidenceIndex: Record<string, CommunicationEvidence> = {};
  const roots = { STUDY: input.study, DIAGNOSTIC: envelope, REPLAY: input.replay, COMPARISON: input.comparison?.value };
  function evidence(kind: CommunicationEvidence['source'], path: string): readonly string[] {
    const id = `${kind}:${path}`;
    const item: CommunicationEvidence = {
      source: kind, sourceId: kind === 'STUDY' ? input.study.id : kind === 'COMPARISON' ? input.comparisonExecutionId! : execution.id,
      studyId: input.study.id, scenarioId: selection.scenarioId, scenarioRevision: selection.scenarioRevision,
      diagnosticExecutionId: execution.id, repetitionId: selection.repetitionId, path, value: text(pointer(roots[kind], path)),
    };
    if (evidenceIndex[id] !== undefined) requireCondition(canonical(evidenceIndex[id]) === canonical(item), 'Evidência duplicada divergente.');
    evidenceIndex[id] = item;
    return [id];
  }
  function fact(kind: CommunicationEvidence['source'], path: string, code: string, label = code): CommunicationFact {
    const value = text(pointer(roots[kind], path));
    requireCondition(value !== null, 'Fato indisponível não pode virar texto.');
    return { code, label, value, evidenceRefs: evidence(kind, path) };
  }
  function metric(kind: CommunicationEvidence['source'], path: string, code: string, label: string,
    unit: CommunicationMetric['unit'], meaning = label): CommunicationMetric {
    const value = text(pointer(roots[kind], path));
    return { code, label, unit, meaning, availability: value === null ? 'UNAVAILABLE' : 'AVAILABLE', value, evidenceRefs: evidence(kind, path) };
  }
  function axisMetric(axis: keyof DiagnosticEnvelope['axes'], name: string, label: string, unit: CommunicationMetric['unit']): CommunicationMetric {
    const path = `/axes/${axis}/${name}`;
    const published = pointer(envelope, path) as { state: string; reason?: string };
    if (published.state !== 'AVAILABLE') return { code: `${axis}.${name}`, label, unit, availability: 'UNAVAILABLE', value: null,
      meaning: published.reason!, evidenceRefs: evidence('DIAGNOSTIC', `${path}/reason`) };
    return metric('DIAGNOSTIC', `${path}/value`, `${axis}.${name}`, label, unit);
  }
  const aggregatePath = '/selected_execution/result/agregado';
  const executiveMetrics = [
    metric('DIAGNOSTIC', `${aggregatePath}/baseline_periodo/total`, 'BASELINE_BRL', 'Custo baseline', 'BRL'),
    metric('DIAGNOSTIC', `${aggregatePath}/netado_periodo/total`, 'NETTED_BRL', 'Custo netado', 'BRL'),
    metric('DIAGNOSTIC', `${aggregatePath}/economia_periodo_brl`, 'SAVINGS_BRL', 'Economia simulada', 'BRL'),
    metric('DIAGNOSTIC', `${aggregatePath}/taxa_netabilidade_periodo`, 'NETABILITY', 'Taxa de netabilidade', 'FRACTION'),
    metric('DIAGNOSTIC', `${aggregatePath}/volume_bruto_periodo_brl`, 'GROSS_BRL', 'Volume bruto medido', 'BRL'),
    metric('DIAGNOSTIC', `${aggregatePath}/volume_remetido_periodo_brl`, 'REMITTED_BRL', 'Volume remetido', 'BRL'),
  ];
  const composition: CommunicationSection = { title: 'Composição', metrics: [
    axisMetric('composition_dependency', 'hhi', 'HHI (índice)', 'TEXT'),
    axisMetric('composition_dependency', 'largest_share', 'Maior participação', 'FRACTION'),
    ...envelope.axes.composition_dependency.participants.flatMap((participant, index) => [
      metric('DIAGNOSTIC', `/axes/composition_dependency/participants/${index}/volume_brl`, `participant.${index}.volume`, `Volume ${participant.participant_id}`, 'BRL'),
      metric('DIAGNOSTIC', `/axes/composition_dependency/participants/${index}/share`, `participant.${index}.share`, `Participação ${participant.participant_id}`, 'FRACTION'),
    ]),
  ], facts: [fact('STUDY', `${executionPath}/sourceSnapshot/source`, 'SOURCE', 'Origem da carteira')] };
  const axisRows = {
    structural_potential: [['gross_out_brl', 'Bruto OUT', 'BRL'], ['gross_in_brl', 'Bruto IN', 'BRL'], ['imbalance_brl', 'Desequilíbrio', 'BRL'], ['ceiling_brl', 'Teto agregado', 'BRL']],
    policy_capture: [['matched_brl', 'Volume casado', 'BRL'], ['intra_client_brl', 'Intracliente', 'BRL'], ['inter_client_brl', 'Entre clientes', 'BRL'], ['uncaptured_potential_brl', 'Potencial não capturado', 'BRL'], ['captured_fraction', 'Fração capturada', 'FRACTION']],
    temporal_compatibility: [['deadline_days', 'Prazo', 'DAYS'], ['same_day_fraction', 'Fração no mesmo dia', 'FRACTION'], ['weighted_wait_days', 'Espera ponderada', 'DAYS'], ['window_closures', 'Fechamentos por janela', 'COUNT'], ['deadline_closures', 'Fechamentos por prazo', 'COUNT'], ['horizon_closures', 'Fechamentos por horizonte', 'COUNT']],
    cross_border_residual: [['remitted_brl', 'Remetido', 'BRL'], ['out_brl', 'Resíduo OUT', 'BRL'], ['in_brl', 'Resíduo IN', 'BRL']],
    operational_profile: [['order_count', 'Ordens', 'COUNT'], ['cycle_count', 'Ciclos', 'COUNT'], ['maximum_open_queue', 'Fila máxima', 'COUNT'], ['due_order_count', 'Ordens vencidas', 'COUNT'], ['weighted_wait_days', 'Espera ponderada', 'DAYS'], ['processing_duration_ms', 'Duração de processamento (ms)', 'TEXT']],
  } as const;
  const mechanism: CommunicationSection = { title: 'Mecanismo', metrics: Object.entries(axisRows).flatMap(([axis, rows]) =>
    rows.map(([name, label, unit]) => axisMetric(axis as keyof DiagnosticEnvelope['axes'], name, label, unit))),
  facts: envelope.consequences.map((item, index) => fact('DIAGNOSTIC', `/consequences/${index}/statement_code`, item.rule_id)) };
  const economics: CommunicationSection = { title: 'Economia', metrics: [
    ...['baseline_periodo', 'netado_periodo'].flatMap((side) => ['iof', 'carry', 'spread', 'espera', 'fixo', 'total'].map((component) =>
      metric('DIAGNOSTIC', `${aggregatePath}/${side}/${component}`, `${side}.${component}`, `${side}: ${component}`, 'BRL'))),
    ...envelope.selected_execution.result.agregado.mecanismos.flatMap((item, index) =>
      ['volume_brl', 'baseline_atribuido_brl', 'custo_netado_brl', 'economia_brl'].map((component) =>
        metric('DIAGNOSTIC', `${aggregatePath}/mecanismos/${index}/${component}`, `${item.destino}.${component}`, `${item.destino}: ${component}`, 'BRL'))),
  ], facts: [] };
  const robustness: CommunicationSection = { title: 'Robustez', metrics: Object.entries(envelope.axes.economic_robustness).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).flatMap(([name, published]) => {
    const path = `/axes/economic_robustness/${name}`;
    const unit = name === 'netability_fraction' ? 'FRACTION' : 'BRL';
    if (published.state !== 'AVAILABLE') return [axisMetric('economic_robustness', name, name, unit)];
    return ['minimum', 'p10', 'p25', 'p50', 'p75', 'p90', 'maximum', 'amplitude'].map((percentile) => metric('DIAGNOSTIC', `${path}/value/${percentile}`, `${name}.${percentile}`, `${name}: ${percentile}`, unit));
  }), facts: [fact('DIAGNOSTIC', '/statistics/kind', 'STATISTICS_KIND'), fact('DIAGNOSTIC', '/statistics/count', 'REPETITION_COUNT'),
    fact('DIAGNOSTIC', '/statistics/selected_repetition_id', 'SELECTED_REPETITION')] };
  const comparison: CommunicationSection | null = input.comparison == null ? null : {
    title: 'Comparação', metrics: input.comparison.value.axes.flatMap((row, index) => (['base', 'hypothesis', 'delta'] as const).map((side) =>
      metric('COMPARISON', `/axes/${index}/${side}`, `${row.axis}.${row.metric}.${side}`, `${row.label} (${row.unit}): ${side}`,
        row.unit === 'NUMBER' ? (row.metric === 'hhi' ? 'TEXT' : 'COUNT') : row.unit === 'MS' ? 'TEXT' : row.unit,
        row.state === 'UNAVAILABLE' ? row.reason ?? 'Métrica indisponível' : row.label))),
    facts: input.comparison.value.inputChanges.flatMap((change, index) => [
      fact('COMPARISON', `/inputChanges/${index}/before`, `${change.code}.${index}.before`, change.label),
      fact('COMPARISON', `/inputChanges/${index}/after`, `${change.code}.${index}.after`, change.label)]),
  };
  const replaySnapshot = input.replay === null ? null : { day: input.replayDay!,
    metrics: Object.keys(input.replay.days[input.replayDay!]!.end_state).sort().map((key) =>
      metric('REPLAY', `/days/${input.replayDay}/end_state/${key}`, key, key, 'BRL')),
    facts: [fact('REPLAY', '/policy', 'POLICY'), fact('REPLAY', '/repetition_id', 'REPETITION')] };
  const limitations = envelope.limitations.map((item, index) => ({ code: item.code, severity: item.severity,
    statement: item.condition, evidenceRefs: evidence('DIAGNOSTIC', `/limitations/${index}/condition`) }));
  for (const [index, warning] of envelope.selected_execution.result.avisos.entries()) limitations.push({ code: `RESULT_WARNING_${index}`,
    severity: 'WARNING', statement: warning, evidenceRefs: evidence('DIAGNOSTIC', `/selected_execution/result/avisos/${index}`) });
  for (const [index, warning] of (input.comparison?.value.limitations ?? []).entries()) limitations.push({ code: `COMPARISON_${index}`,
    severity: 'WARNING', statement: warning, evidenceRefs: evidence('COMPARISON', `/limitations/${index}`) });
  const assumptions = Object.keys(execution.premisesSnapshot.costs).sort().map((key) => fact('STUDY', `${executionPath}/premisesSnapshot/costs/${key}`, `COST.${key}`, key));
  const rulesPath = `${executionPath}/premisesSnapshot/costs/iof_por_finalidade`;
  const exactRules = new Set(execution.premisesSnapshot.costs.iof_por_finalidade.map((rule) =>
    JSON.stringify([rule.finalidade, rule.direcao])));
  let specific = false;
  let fallback = false;
  const applicationEvidence = [...evidence('STUDY', rulesPath), ...evidence('STUDY', `${executionPath}/inputFingerprint`)];
  for (const order of execution.sourceSnapshot.orders) {
    if (order.finalidade !== null && exactRules.has(JSON.stringify([order.finalidade, order.direcao]))) specific = true;
    else fallback = true;
  }
  assumptions.push({ code: 'IOF_APPLICATION_MODE', label: 'Aplicação de IOF',
    value: specific ? (fallback ? 'MIXED' : 'SPECIFIC_ONLY') : 'FALLBACK_ONLY', evidenceRefs: applicationEvidence });
  assumptions.push(fact('STUDY', `${executionPath}/premisesSnapshot/windowDays`, 'WINDOW_DAYS', 'Janela em dias'),
    fact('STUDY', `${executionPath}/periodSnapshot`, 'PERIOD', 'Período'));
  const provenance = [fact('STUDY', `${executionPath}/sourceSnapshot/sourceFingerprint`, 'SOURCE_FINGERPRINT'),
    fact('STUDY', `${executionPath}/inputFingerprint`, 'INPUT_FINGERPRINT'), ...execution.sourceSnapshot.provenance.map((_, index) =>
      fact('STUDY', `${executionPath}/sourceSnapshot/provenance/${index}`, `SOURCE_PROVENANCE_${index}`))];
  const versions = [fact('DIAGNOSTIC', '/api_version', 'API_VERSION'), fact('DIAGNOSTIC', '/schema_version', 'DIAGNOSTIC_VERSION'),
    fact('DIAGNOSTIC', '/selected_execution/presentation_version', 'PRESENTATION_VERSION'),
    fact('DIAGNOSTIC', '/selected_execution/motor_build_sha', 'MOTOR_BUILD_SHA'),
    fact('DIAGNOSTIC', '/selected_execution/result/manifesto/versao_motor', 'MOTOR_VERSION')];
  const projection = { apiVersion: '1.0.0' as const, presentationVersion: '1.0.0' as const,
    generatedAt: input.generatedAt ?? input.study.updatedAt,
    study: { id: input.study.id, name: input.study.name, revision: input.study.revision }, selection, source,
    executiveMetrics, composition, mechanism, economics, robustness, comparison, replaySnapshot, assumptions, provenance, limitations, versions, evidenceIndex };
  const document = { ...projection, contextFingerprint: await fingerprintCommunicationDocument(projection) };
  performance.clearMarks('mot97:communication:projected');
  performance.mark('mot97:communication:projected');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await assertValidCommunicationDocument(document, input.study);
  performance.clearMarks('mot97:communication:validated');
  performance.mark('mot97:communication:validated');
  return deepFreeze(document);
}
