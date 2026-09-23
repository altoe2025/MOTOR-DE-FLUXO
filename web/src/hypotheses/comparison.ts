import Decimal from 'decimal.js';

import type { DiagnosticExecutionRecord, EffectiveInput, PortfolioSourceSnapshot } from '../study/model';

export type MvpComparisonMetric = Readonly<{
  axis: keyof typeof AXIS_TITLES;
  metric: string;
  label: string;
  unit: 'BRL' | 'FRACTION' | 'DAYS' | 'NUMBER' | 'MS';
  base: string | null;
  hypothesis: string | null;
  delta: string | null;
  state: 'AVAILABLE' | 'UNAVAILABLE';
  reason?: string;
}>;

export type MvpInputChange = Readonly<{
  code: 'VOLUME' | 'MIX' | 'TICKET' | 'DEADLINE' | 'WINDOW' | 'COST'
    | 'PARTICIPANT_ADDED' | 'PARTICIPANT_REMOVED' | 'PARTICIPANT_UPDATED' | 'IOF_RULE';
  label: string;
  before: string;
  after: string;
}>;

export type MvpComparison = Readonly<{
  compatibility: CompositionCompatibilityReport;
  axes: readonly MvpComparisonMetric[];
  inputChanges: readonly MvpInputChange[];
  limitations: readonly string[];
}>;

export type ParticipantSnapshot = Readonly<{
  participantId: string;
  profileId: string | null;
  profileFingerprint: string | null;
  seed: string;
}>;

export type ParticipantPair = Readonly<{
  participantId: string;
  profileId: string;
  profileFingerprint: string;
}>;

export type ParticipantDifference = Readonly<{
  participantId: string;
  fields: readonly string[];
}>;

export type CompositionCompatibilityBlocker = Readonly<{
  code: 'PROFILE_LINEAGE_MISSING' | 'PROFILE_IDENTITY_MISMATCH'
    | 'PROFILE_FINGERPRINT_MISMATCH' | 'SEED_MISMATCH' | 'UNDECLARED_CHANGE';
  participantId: string;
  message: string;
}>;

export type CompositionCompatibilityReport = Readonly<{
  status: 'COMPARABLE' | 'INCOMPATIBLE';
  maintained: readonly ParticipantPair[];
  added: readonly ParticipantSnapshot[];
  removed: readonly ParticipantSnapshot[];
  modified: readonly ParticipantDifference[];
  blockers: readonly CompositionCompatibilityBlocker[];
}>;

export type MvpComparisonResult =
  | Readonly<{ ok: true; value: MvpComparison }>
  | Readonly<{ ok: false; code: 'INCOMPATIBLE_EXECUTIONS'; reason: string }>;

export const AXIS_TITLES = {
  STRUCTURAL_POTENTIAL: '1. Potencial estrutural',
  POLICY_CAPTURE: '2. Captura pela política',
  TEMPORAL_COMPATIBILITY: '3. Compatibilidade temporal',
  CROSS_BORDER_RESIDUAL: '4. Exposição residual',
  COMPOSITION_DEPENDENCY: '5. Dependência da composição',
  ECONOMIC_ROBUSTNESS: '6. Robustez econômica',
  OPERATIONAL_PROFILE: '7. Perfil operacional da carteira',
} as const;

type DiagnosticAxes = NonNullable<DiagnosticExecutionRecord['envelope']>['axes'];
type ScalarMetric = DiagnosticAxes['structural_potential']['gross_out_brl'];
type DistributionMetric = DiagnosticAxes['economic_robustness']['baseline_brl'];
type ScalarDefinition = Readonly<{
  axis: keyof typeof AXIS_TITLES; metric: string; label: string;
  unit: MvpComparisonMetric['unit'];
  read(axes: DiagnosticAxes): ScalarMetric;
}>;
type DistributionDefinition = Omit<ScalarDefinition, 'read'> & Readonly<{
  read(axes: DiagnosticAxes): DistributionMetric;
}>;

const scalar = (
  axis: ScalarDefinition['axis'], metric: string, label: string,
  unit: ScalarDefinition['unit'], read: ScalarDefinition['read'],
): ScalarDefinition => ({ axis, metric, label, unit, read });

const SCALARS: readonly ScalarDefinition[] = [
  scalar('STRUCTURAL_POTENTIAL', 'gross_out_brl', 'Bruto OUT', 'BRL', (a) => a.structural_potential.gross_out_brl),
  scalar('STRUCTURAL_POTENTIAL', 'gross_in_brl', 'Bruto IN', 'BRL', (a) => a.structural_potential.gross_in_brl),
  scalar('STRUCTURAL_POTENTIAL', 'imbalance_brl', 'Desequilíbrio', 'BRL', (a) => a.structural_potential.imbalance_brl),
  scalar('STRUCTURAL_POTENTIAL', 'ceiling_brl', 'Teto agregado', 'BRL', (a) => a.structural_potential.ceiling_brl),
  scalar('POLICY_CAPTURE', 'matched_brl', 'Volume casado', 'BRL', (a) => a.policy_capture.matched_brl),
  scalar('POLICY_CAPTURE', 'intra_client_brl', 'Intra-cliente', 'BRL', (a) => a.policy_capture.intra_client_brl),
  scalar('POLICY_CAPTURE', 'inter_client_brl', 'Entre participantes', 'BRL', (a) => a.policy_capture.inter_client_brl),
  scalar('POLICY_CAPTURE', 'uncaptured_potential_brl', 'Potencial não capturado', 'BRL', (a) => a.policy_capture.uncaptured_potential_brl),
  scalar('POLICY_CAPTURE', 'captured_fraction', 'Fração capturada', 'FRACTION', (a) => a.policy_capture.captured_fraction),
  scalar('TEMPORAL_COMPATIBILITY', 'deadline_days', 'Prazo', 'DAYS', (a) => a.temporal_compatibility.deadline_days),
  scalar('TEMPORAL_COMPATIBILITY', 'same_day_fraction', 'Fração no mesmo dia', 'FRACTION', (a) => a.temporal_compatibility.same_day_fraction),
  scalar('TEMPORAL_COMPATIBILITY', 'weighted_wait_days', 'Espera ponderada', 'DAYS', (a) => a.temporal_compatibility.weighted_wait_days),
  scalar('TEMPORAL_COMPATIBILITY', 'window_closures', 'Fechamentos por janela', 'NUMBER', (a) => a.temporal_compatibility.window_closures),
  scalar('TEMPORAL_COMPATIBILITY', 'deadline_closures', 'Fechamentos por prazo', 'NUMBER', (a) => a.temporal_compatibility.deadline_closures),
  scalar('TEMPORAL_COMPATIBILITY', 'horizon_closures', 'Fechamentos por horizonte', 'NUMBER', (a) => a.temporal_compatibility.horizon_closures),
  scalar('CROSS_BORDER_RESIDUAL', 'remitted_brl', 'Remetido', 'BRL', (a) => a.cross_border_residual.remitted_brl),
  scalar('CROSS_BORDER_RESIDUAL', 'out_brl', 'Resíduo OUT', 'BRL', (a) => a.cross_border_residual.out_brl),
  scalar('CROSS_BORDER_RESIDUAL', 'in_brl', 'Resíduo IN', 'BRL', (a) => a.cross_border_residual.in_brl),
  scalar('COMPOSITION_DEPENDENCY', 'hhi', 'HHI', 'NUMBER', (a) => a.composition_dependency.hhi),
  scalar('COMPOSITION_DEPENDENCY', 'largest_share', 'Maior participação', 'FRACTION', (a) => a.composition_dependency.largest_share),
  scalar('OPERATIONAL_PROFILE', 'order_count', 'Ordens', 'NUMBER', (a) => a.operational_profile.order_count),
  scalar('OPERATIONAL_PROFILE', 'cycle_count', 'Ciclos', 'NUMBER', (a) => a.operational_profile.cycle_count),
  scalar('OPERATIONAL_PROFILE', 'maximum_open_queue', 'Fila máxima', 'NUMBER', (a) => a.operational_profile.maximum_open_queue),
  scalar('OPERATIONAL_PROFILE', 'due_order_count', 'Ordens vencidas', 'NUMBER', (a) => a.operational_profile.due_order_count),
  scalar('OPERATIONAL_PROFILE', 'weighted_wait_days', 'Espera ponderada', 'DAYS', (a) => a.operational_profile.weighted_wait_days),
  scalar('OPERATIONAL_PROFILE', 'processing_duration_ms', 'Duração de processamento', 'MS', (a) => a.operational_profile.processing_duration_ms),
];

const DISTRIBUTIONS: readonly DistributionDefinition[] = [
  { axis: 'ECONOMIC_ROBUSTNESS', metric: 'baseline_brl.p50', label: 'Baseline p50', unit: 'BRL', read: (a) => a.economic_robustness.baseline_brl },
  { axis: 'ECONOMIC_ROBUSTNESS', metric: 'netted_brl.p50', label: 'Custo netado p50', unit: 'BRL', read: (a) => a.economic_robustness.netted_brl },
  { axis: 'ECONOMIC_ROBUSTNESS', metric: 'savings_brl.p50', label: 'Economia p50', unit: 'BRL', read: (a) => a.economic_robustness.savings_brl },
  { axis: 'ECONOMIC_ROBUSTNESS', metric: 'netability_fraction.p50', label: 'Netabilidade p50', unit: 'FRACTION', read: (a) => a.economic_robustness.netability_fraction },
];

/** Validate published identity only; never recompute values or deltas. */
export function hasCanonicalComparisonMetricIdentity(row: MvpComparisonMetric): boolean {
  return [...SCALARS, ...DISTRIBUTIONS].some((definition) => definition.axis === row.axis
    && definition.metric === row.metric && definition.label === row.label && definition.unit === row.unit);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function incompatible(reason: string): MvpComparisonResult {
  return { ok: false, code: 'INCOMPATIBLE_EXECUTIONS', reason };
}

function lineage(input: EffectiveInput): readonly string[] | null {
  const result: string[] = [];
  for (const participant of input.participants) {
    const source = input.sources[`/participants/${participant.id}/profile`]?.source;
    const match = source?.match(/^profile-mvp:(.+)@([0-9a-f]{64}):(?:derived|hypothesis)$/);
    if (match === undefined || match === null) return null;
    result.push(`${match[1]}@${match[2]}@${participant.id}`);
  }
  return result.sort();
}

function profileLineage(input: EffectiveInput, participantId: string): Readonly<{
  profileId: string;
  profileFingerprint: string;
}> | null {
  const source = input.sources[`/participants/${participantId}/profile`]?.source;
  const match = source?.match(/^profile-mvp:(.+)@([0-9a-f]{64}):(?:derived|hypothesis)$/);
  return match === undefined || match === null
    ? null : { profileId: match[1]!, profileFingerprint: match[2]! };
}

function participantSnapshot(input: EffectiveInput, participant: EffectiveInput['participants'][number]): ParticipantSnapshot {
  const profile = profileLineage(input, participant.id);
  return {
    participantId: participant.id,
    profileId: profile?.profileId ?? null,
    profileFingerprint: profile?.profileFingerprint ?? null,
    seed: participant.seed,
  };
}

const MUTABLE_PARTICIPANT_FIELDS = [
  'profile', 'monthly_volume_brl', 'ticket_median_brl', 'out_fraction',
  'deadline', 'eh_efx', 'purpose_out', 'purpose_in',
] as const;

export function compareCompositionInputs(
  base: EffectiveInput,
  hypothesis: EffectiveInput,
): CompositionCompatibilityReport {
  const left = new Map(base.participants.map((participant) => [participant.id, participant]));
  const right = new Map(hypothesis.participants.map((participant) => [participant.id, participant]));
  const maintained: ParticipantPair[] = [];
  const added: ParticipantSnapshot[] = [];
  const removed: ParticipantSnapshot[] = [];
  const modified: ParticipantDifference[] = [];
  const blockers: CompositionCompatibilityBlocker[] = [];
  const ids = [...new Set([...left.keys(), ...right.keys()])].sort();
  for (const participantId of ids) {
    const before = left.get(participantId); const after = right.get(participantId);
    if (before === undefined && after !== undefined) {
      const snapshot = participantSnapshot(hypothesis, after);
      added.push(snapshot);
      if (snapshot.profileId === null) blockers.push({
        code: 'PROFILE_LINEAGE_MISSING', participantId, message: 'Linhagem do Perfil adicionado ausente.',
      });
      continue;
    }
    if (after === undefined && before !== undefined) {
      const snapshot = participantSnapshot(base, before);
      removed.push(snapshot);
      if (snapshot.profileId === null) blockers.push({
        code: 'PROFILE_LINEAGE_MISSING', participantId, message: 'Linhagem do Perfil removido ausente.',
      });
      continue;
    }
    if (before === undefined || after === undefined) continue;
    const beforeProfile = profileLineage(base, participantId);
    const afterProfile = profileLineage(hypothesis, participantId);
    if (beforeProfile === null || afterProfile === null) {
      blockers.push({ code: 'PROFILE_LINEAGE_MISSING', participantId, message: 'Linhagem de Perfil ausente.' });
    } else {
      if (beforeProfile.profileId !== afterProfile.profileId) blockers.push({
        code: 'PROFILE_IDENTITY_MISMATCH', participantId,
        message: 'A identidade do participante foi reutilizada por outro Perfil.',
      });
      if (beforeProfile.profileFingerprint !== afterProfile.profileFingerprint) blockers.push({
        code: 'PROFILE_FINGERPRINT_MISMATCH', participantId,
        message: 'O fingerprint do Perfil comum diverge.',
      });
      maintained.push({ participantId, profileId: beforeProfile.profileId, profileFingerprint: beforeProfile.profileFingerprint });
    }
    if (before.seed !== after.seed) blockers.push({
      code: 'SEED_MISMATCH', participantId, message: 'A seed de participante mantido diverge.',
    });
    const fields = MUTABLE_PARTICIPANT_FIELDS
      .filter((field) => canonical(before[field]) !== canonical(after[field]));
    if (fields.length > 0) {
      modified.push({ participantId, fields });
      const sourcePaths = fields.flatMap((field) => field === 'deadline'
        ? [`/participants/${participantId}/deadline/mode`, `/participants/${participantId}/deadline/days`]
        : [`/participants/${participantId}/${field}`]);
      const hasTrackedSource = sourcePaths.some((path) => base.sources[path] !== undefined || hypothesis.sources[path] !== undefined);
      const hasDeclaredSource = sourcePaths.some((path) => {
        const next = hypothesis.sources[path];
        return next !== undefined && canonical(next) !== canonical(base.sources[path])
          && next.kind === 'ESTIMATIVA_USUARIO';
      });
      if (hasTrackedSource && !hasDeclaredSource) blockers.push({
        code: 'UNDECLARED_CHANGE', participantId,
        message: 'A alteração do participante não possui source atualizada.',
      });
    }
  }
  return {
    status: blockers.length === 0 ? 'COMPARABLE' : 'INCOMPATIBLE',
    maintained, added, removed, modified, blockers,
  };
}

function compatibleSources(left: PortfolioSourceSnapshot, right: PortfolioSourceSnapshot): string | null {
  if (left.source.kind !== right.source.kind) return 'Famílias de origem diferentes.';
  if (left.source.kind === 'OBSERVED_CASE' && right.source.kind === 'OBSERVED_CASE') {
    return canonical({ source: left.source, orders: left.orders, provenance: left.provenanceByOrder })
      === canonical({ source: right.source, orders: right.orders, provenance: right.provenanceByOrder })
      ? null : 'Casos observados ou ordens diferentes.';
  }
  if (left.source.kind === 'SYNTHETIC' && right.source.kind === 'SYNTHETIC') {
    const a = left.generationInputSnapshot; const b = right.generationInputSnapshot;
    if (a === undefined || b === undefined) return 'Entrada de geração ausente.';
    const composition = compareCompositionInputs(a, b);
    const compatible = left.source.recipe.preparationVersion === right.source.recipe.preparationVersion
      && left.source.recipe.generatorVersion === right.source.recipe.generatorVersion
      && left.source.recipe.motorBuildSha === right.source.recipe.motorBuildSha
      && lineage(a) !== null && lineage(b) !== null
      && composition.status === 'COMPARABLE';
    return compatible ? null : 'Recipes, participantes ou linhagem de Perfil incompatíveis.';
  }
  return left.source.kind === 'AUTHORED' && right.source.kind === 'AUTHORED'
    && canonical(left) === canonical(right) ? null : 'Origens autorais incompatíveis.';
}

function metricRow(
  definition: ScalarDefinition,
  baseAxes: DiagnosticAxes,
  hypothesisAxes: DiagnosticAxes,
): MvpComparisonMetric {
  const base = definition.read(baseAxes); const hypothesis = definition.read(hypothesisAxes);
  if (base.state !== 'AVAILABLE' || hypothesis.state !== 'AVAILABLE') {
    const reason = base.state !== 'AVAILABLE' ? base.reason
      : hypothesis.state !== 'AVAILABLE' ? hypothesis.reason : 'Métrica indisponível.';
    return { axis: definition.axis, metric: definition.metric, label: definition.label,
      unit: definition.unit, base: null, hypothesis: null, delta: null,
      state: 'UNAVAILABLE', reason };
  }
  return { axis: definition.axis, metric: definition.metric, label: definition.label, unit: definition.unit,
    base: base.value, hypothesis: hypothesis.value,
    delta: new Decimal(hypothesis.value).minus(base.value).toString(), state: 'AVAILABLE' };
}

function distributionRow(
  definition: DistributionDefinition,
  baseAxes: DiagnosticAxes,
  hypothesisAxes: DiagnosticAxes,
): MvpComparisonMetric {
  const base = definition.read(baseAxes); const hypothesis = definition.read(hypothesisAxes);
  if (base.state !== 'AVAILABLE' || hypothesis.state !== 'AVAILABLE') {
    const reason = base.state !== 'AVAILABLE' ? base.reason
      : hypothesis.state !== 'AVAILABLE' ? hypothesis.reason : 'Métrica indisponível.';
    return { axis: definition.axis, metric: definition.metric, label: definition.label, unit: definition.unit,
      base: null, hypothesis: null, delta: null, state: 'UNAVAILABLE', reason };
  }
  return { axis: definition.axis, metric: definition.metric, label: definition.label, unit: definition.unit,
    base: base.value.p50, hypothesis: hypothesis.value.p50,
    delta: new Decimal(hypothesis.value.p50).minus(base.value.p50).toString(), state: 'AVAILABLE' };
}

function inputChanges(base: DiagnosticExecutionRecord, hypothesis: DiagnosticExecutionRecord): readonly MvpInputChange[] {
  const changes: MvpInputChange[] = [];
  const add = (code: MvpInputChange['code'], label: string, before: unknown, after: unknown) => {
    const left = canonical(before); const right = canonical(after);
    if (left !== right) changes.push({ code, label, before: left, after: right });
  };
  const a = base.sourceSnapshot.generationInputSnapshot;
  const b = hypothesis.sourceSnapshot.generationInputSnapshot;
  if (a !== undefined && b !== undefined) {
    const composition = compareCompositionInputs(a, b);
    for (const item of composition.added) changes.push({ code: 'PARTICIPANT_ADDED', label: `Participante adicionado: ${item.participantId}`, before: 'Ausente', after: item.profileId ?? 'Perfil indisponível' });
    for (const item of composition.removed) changes.push({ code: 'PARTICIPANT_REMOVED', label: `Participante removido: ${item.participantId}`, before: item.profileId ?? 'Perfil indisponível', after: 'Ausente' });
    for (const item of composition.modified) changes.push({ code: 'PARTICIPANT_UPDATED', label: `Participante alterado: ${item.participantId}`, before: 'Valores base', after: item.fields.join(', ') });
    add('VOLUME', 'Volume', a.participants.map((p) => p.monthly_volume_brl), b.participants.map((p) => p.monthly_volume_brl));
    add('MIX', 'Mix OUT/IN', a.participants.map((p) => p.out_fraction), b.participants.map((p) => p.out_fraction));
    add('TICKET', 'Ticket', a.participants.map((p) => p.ticket_median_brl), b.participants.map((p) => p.ticket_median_brl));
    add('DEADLINE', 'Prazo', a.participants.map((p) => p.deadline), b.participants.map((p) => p.deadline));
  }
  add('WINDOW', 'Janela', base.premisesSnapshot.windowDays, hypothesis.premisesSnapshot.windowDays);
  const scalarCosts = (execution: DiagnosticExecutionRecord) => {
    const { iof_por_finalidade: _frozen, ...costs } = execution.premisesSnapshot.costs;
    void _frozen; return costs;
  };
  add('COST', 'Custos escalares', scalarCosts(base), scalarCosts(hypothesis));
  add('IOF_RULE', 'Regras de IOF por finalidade', base.premisesSnapshot.costs.iof_por_finalidade, hypothesis.premisesSnapshot.costs.iof_por_finalidade);
  return changes;
}

/** Shared compatibility gate for calculation and consumers of a published comparison. */
export function mvpDiagnosticIncompatibility(
  base: DiagnosticExecutionRecord,
  hypothesis: DiagnosticExecutionRecord,
): string | null {
  if (base.status !== 'SUCCEEDED' || hypothesis.status !== 'SUCCEEDED'
      || base.envelope === null || hypothesis.envelope === null) return 'As duas execuções devem estar concluídas.';
  if (base.scenarioId === hypothesis.scenarioId) return 'Selecione cenários diferentes.';
  const a = base.envelope; const b = hypothesis.envelope;
  if (a.api_version !== b.api_version || a.schema_version !== b.schema_version
      || a.selected_execution.motor_build_sha !== b.selected_execution.motor_build_sha
      || a.selected_execution.presentation_version !== b.selected_execution.presentation_version
      || canonical(a.selected_execution.presentation) !== canonical(b.selected_execution.presentation)
      || canonical(base.periodSnapshot) !== canonical(hypothesis.periodSnapshot)) {
    return 'Versões, apresentação ou horizonte incompatíveis.';
  }
  return compatibleSources(base.sourceSnapshot, hypothesis.sourceSnapshot);
}

export function compareMvpDiagnostics(
  base: DiagnosticExecutionRecord,
  hypothesis: DiagnosticExecutionRecord,
): MvpComparisonResult {
  const reason = mvpDiagnosticIncompatibility(base, hypothesis);
  if (reason !== null) return incompatible(reason);
  const a = base.envelope!; const b = hypothesis.envelope!;
  const baseInput = base.sourceSnapshot.generationInputSnapshot;
  const hypothesisInput = hypothesis.sourceSnapshot.generationInputSnapshot;
  const compatibility = baseInput !== undefined && hypothesisInput !== undefined
    ? compareCompositionInputs(baseInput, hypothesisInput)
    : { status: 'COMPARABLE' as const, maintained: [], added: [], removed: [], modified: [], blockers: [] };
  const axes = [
    ...SCALARS.slice(0, 20).map((item) => metricRow(item, a.axes, b.axes)),
    ...DISTRIBUTIONS.map((item) => distributionRow(item, a.axes, b.axes)),
    ...SCALARS.slice(20).map((item) => metricRow(item, a.axes, b.axes)),
  ];
  const limitations = [
    ...(compatibility.added.length > 0 || compatibility.removed.length > 0 ? ['COMPOSITION_CHANGED'] : []),
    'UNPAIRED_DIAGNOSTICS',
  ];
  return { ok: true, value: { compatibility, axes, inputChanges: inputChanges(base, hypothesis), limitations } };
}
