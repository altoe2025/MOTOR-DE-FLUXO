import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../api/client';
import { makeObservedSnapshot, makeScenarioDraft } from '../study/fixtures';
import type { DiagnosticExecutionRecord } from '../study/model';
import { compareMvpDiagnostics } from './comparison';

const available = (value: string) => ({ state: 'AVAILABLE' as const, value, evidence: ['fixture'] });
const distribution = (p50: string) => ({ state: 'AVAILABLE' as const, value: {
  minimum: p50, p10: p50, p25: p50, p50, p75: p50, p90: p50, maximum: p50, amplitude: '0',
}, evidence: ['fixture'] });

function axes(value: string, unavailableSavings = false): DiagnosticEnvelope['axes'] {
  return {
    structural_potential: { gross_out_brl: available(value), gross_in_brl: available('80'), imbalance_brl: available('20'), ceiling_brl: available('160') },
    policy_capture: { matched_brl: available('120'), intra_client_brl: available('70'), inter_client_brl: available('50'), uncaptured_potential_brl: available('40'), captured_fraction: available('0.75') },
    temporal_compatibility: { deadline_days: available('7'), same_day_fraction: available('0.2'), weighted_wait_days: available('2.5'), window_closures: available('4'), deadline_closures: available('2'), horizon_closures: available('1') },
    cross_border_residual: { remitted_brl: available('60'), out_brl: available('40'), in_brl: available('20'), by_day: [], by_purpose: [] },
    composition_dependency: { hhi: available('0.4'), largest_share: available('0.5'), participants: [] },
    economic_robustness: {
      baseline_brl: distribution('100'), netted_brl: distribution('80'),
      savings_brl: unavailableSavings ? { state: 'NOT_COLLECTED', reason: 'SEM_AMOSTRA', evidence: [] } : distribution('20'),
      netability_fraction: distribution('0.2'),
    },
    operational_profile: { order_count: available('8'), cycle_count: available('3'), maximum_open_queue: available('4'), due_order_count: available('2'), weighted_wait_days: available('2.5'), processing_duration_ms: available('12') },
  };
}

function execution(input: { id: string; scenarioId: string; gross: string; window: number; motor?: string; unavailableSavings?: boolean }): DiagnosticExecutionRecord {
  const scenario = makeScenarioDraft();
  const sourceSnapshot = makeObservedSnapshot();
  const envelope = {
    api_version: '1.0.0', schema_version: '1.0.0', axes: axes(input.gross, input.unavailableSavings),
    selected_execution: { motor_build_sha: input.motor ?? 'd'.repeat(40), presentation_version: '1.0.0', presentation: {} },
  } as unknown as DiagnosticEnvelope;
  return {
    kind: 'DIAGNOSTIC', id: input.id, attemptId: `attempt-${input.id}`,
    scenarioId: input.scenarioId, scenarioRevision: 1, inputFingerprint: 'f'.repeat(64),
    requestSnapshot: {} as DiagnosticExecutionRecord['requestSnapshot'],
    sourceSnapshot, premisesSnapshot: { ...scenario.premises, windowDays: input.window },
    periodSnapshot: scenario.period, status: 'SUCCEEDED', jobId: input.id, envelope,
    error: null, createdAt: '2026-09-20T12:00:00Z', finishedAt: '2026-09-20T12:01:00Z',
  };
}

describe('compareMvpDiagnostics', () => {
  it('calcula hipótese menos base nos sete eixos e preserva indisponibilidade', () => {
    const result = compareMvpDiagnostics(
      execution({ id: 'base', scenarioId: 'scenario-base', gross: '100', window: 7 }),
      execution({ id: 'hypothesis', scenarioId: 'scenario-hypothesis', gross: '125', window: 3, unavailableSavings: true }),
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.axes.map(({ axis, metric }) => `${axis}.${metric}`)).toEqual([
      'STRUCTURAL_POTENTIAL.gross_out_brl', 'STRUCTURAL_POTENTIAL.gross_in_brl',
      'STRUCTURAL_POTENTIAL.imbalance_brl', 'STRUCTURAL_POTENTIAL.ceiling_brl',
      'POLICY_CAPTURE.matched_brl', 'POLICY_CAPTURE.intra_client_brl',
      'POLICY_CAPTURE.inter_client_brl', 'POLICY_CAPTURE.uncaptured_potential_brl',
      'POLICY_CAPTURE.captured_fraction', 'TEMPORAL_COMPATIBILITY.deadline_days',
      'TEMPORAL_COMPATIBILITY.same_day_fraction', 'TEMPORAL_COMPATIBILITY.weighted_wait_days',
      'TEMPORAL_COMPATIBILITY.window_closures', 'TEMPORAL_COMPATIBILITY.deadline_closures',
      'TEMPORAL_COMPATIBILITY.horizon_closures', 'CROSS_BORDER_RESIDUAL.remitted_brl',
      'CROSS_BORDER_RESIDUAL.out_brl', 'CROSS_BORDER_RESIDUAL.in_brl',
      'COMPOSITION_DEPENDENCY.hhi', 'COMPOSITION_DEPENDENCY.largest_share',
      'ECONOMIC_ROBUSTNESS.baseline_brl.p50', 'ECONOMIC_ROBUSTNESS.netted_brl.p50',
      'ECONOMIC_ROBUSTNESS.savings_brl.p50', 'ECONOMIC_ROBUSTNESS.netability_fraction.p50',
      'OPERATIONAL_PROFILE.order_count', 'OPERATIONAL_PROFILE.cycle_count',
      'OPERATIONAL_PROFILE.maximum_open_queue', 'OPERATIONAL_PROFILE.due_order_count',
      'OPERATIONAL_PROFILE.weighted_wait_days', 'OPERATIONAL_PROFILE.processing_duration_ms',
    ]);
    expect(result.value.axes[0]).toMatchObject({ delta: '25' });
    expect(result.value.axes.find((item) => item.metric === 'savings_brl.p50')).toMatchObject({ delta: null, state: 'UNAVAILABLE', reason: 'SEM_AMOSTRA' });
    expect(result.value.inputChanges.map((item) => item.code)).toEqual(['WINDOW']);
    expect(result.value.limitations).toContain('UNPAIRED_DIAGNOSTICS');
  });

  it('bloqueia versões de motor diferentes', () => {
    expect(compareMvpDiagnostics(
      execution({ id: 'base', scenarioId: 'scenario-base', gross: '100', window: 7 }),
      execution({ id: 'hypothesis', scenarioId: 'scenario-hypothesis', gross: '100', window: 7, motor: 'e'.repeat(40) }),
    )).toMatchObject({ ok: false, code: 'INCOMPATIBLE_EXECUTIONS' });
  });
});
