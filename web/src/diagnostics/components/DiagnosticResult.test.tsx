// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DiagnosticEnvelope } from '../../api/client';
import { DiagnosticAxesView } from './DiagnosticAxesView';
import { DiagnosticDistribution } from './DiagnosticDistribution';
import { SelectedExecution } from './SelectedExecution';

vi.mock('./EChart', async () => {
  const { chartPresentation } = await import('../presentation');
  return { ChartWithTable: ({ series }: { series: import('../presentation').ChartSeries }) => {
    const { rows } = chartPresentation(series);
    return <table><caption>{series.name} — dados do gráfico</caption><tbody>{rows.map((row) => <tr key={row.label}><th>{row.label}</th><td>{row.value}</td></tr>)}</tbody></table>;
  } };
});

const metric = (value: string, evidence = ['evidence/source']) => ({ state: 'AVAILABLE' as const, value, evidence });
const distribution = {
  state: 'AVAILABLE' as const,
  value: { minimum: '10', p10: '11', p25: '12', p50: '13', p75: '14', p90: '15', maximum: '16', amplitude: '6' },
  evidence: ['repetitions'],
};

const axes: DiagnosticEnvelope['axes'] = {
  structural_potential: { gross_out_brl: metric('100'), gross_in_brl: metric('80'), imbalance_brl: metric('20'), ceiling_brl: metric('160') },
  policy_capture: { matched_brl: metric('120'), intra_client_brl: metric('70'), inter_client_brl: metric('50'), uncaptured_potential_brl: metric('40'), captured_fraction: metric('0.75') },
  temporal_compatibility: { deadline_days: metric('7'), same_day_fraction: metric('0.2'), weighted_wait_days: metric('2.5'), window_closures: metric('4'), deadline_closures: metric('2'), horizon_closures: metric('1') },
  cross_border_residual: { remitted_brl: metric('60'), out_brl: metric('40'), in_brl: metric('20'), by_day: [{ key: 'D+1', direction: 'OUT', value_brl: '40' }], by_purpose: [] },
  composition_dependency: { hhi: metric('0.4'), largest_share: metric('0.5'), participants: [{ participant_id: 'cliente-a', volume_brl: '90', share: '0.5' }] },
  economic_robustness: { baseline_brl: distribution, netted_brl: distribution, savings_brl: distribution, netability_fraction: distribution },
  operational_profile: { order_count: metric('8'), cycle_count: metric('3'), maximum_open_queue: metric('4'), due_order_count: metric('2'), weighted_wait_days: metric('2.5'), processing_duration_ms: metric('12') },
};

describe('resultado do diagnóstico', () => {
  it('mantém distribuição separada da execução selecionada', () => {
    const repetitions: DiagnosticEnvelope['repetitions'] = [{
      repetition_id: '00000000-0000-4000-8000-000000000001', participant_seeds: {},
      input_fingerprint: 'a'.repeat(64), execution_fingerprint: 'b'.repeat(64),
      baseline_brl: '100', netted_brl: '80', savings_brl: '20', netability_fraction: '0.2', duration_ms: 5,
    }];
    const { rerender } = render(<DiagnosticDistribution
      statistics={{ kind: 'DISTRIBUTION', count: 10, selected_repetition_id: repetitions[0]!.repetition_id, percentile_method: 'EMPIRICAL_NEAREST_RANK' }}
      repetitions={repetitions}
      economics={axes.economic_robustness}
    />);
    expect(screen.getByRole('heading', { name: 'Distribuição de repetições' })).toBeVisible();
    expect(screen.getByText(/método EMPIRICAL_NEAREST_RANK/)).toBeVisible();

    rerender(<SelectedExecution envelope={{
      statistics: { kind: 'SINGLE_EXECUTION', count: 1, selected_repetition_id: '00000000-0000-4000-8000-000000000005', percentile_method: null },
      selected_execution: {
      kind: 'PREVIA', api_version: '1.0.0', request_id: '00000000-0000-4000-8000-000000000001',
      execution_id: '00000000-0000-4000-8000-000000000002', study_id: '00000000-0000-4000-8000-000000000003',
      scenario_id: '00000000-0000-4000-8000-000000000004', scenario_revision: 1,
      execution_fingerprint: 'c'.repeat(64), input_snapshot: {} as never, motor_build_sha: 'd'.repeat(40),
      presentation: {} as never, presentation_version: '1.0.0', provenance_fingerprint: 'e'.repeat(64),
      statistics: { kind: 'SINGLE_EXECUTION', count: 1, repetition_id: '00000000-0000-4000-8000-000000000005', percentile_method: null, seed: null },
      result: {} as never,
      },
    } as unknown as DiagnosticEnvelope} />);
    expect(screen.getByRole('heading', { name: 'Execução selecionada' })).toBeVisible();
    expect(screen.getByText('c'.repeat(64))).toBeVisible();
  });

  it('renderiza os sete eixos na ordem canônica com interpretação e proveniência', () => {
    const { container } = render(<DiagnosticAxesView axes={axes} consequences={[{
      axis: 'POLICY_CAPTURE', rule_id: 'capture', rule_version: '1.0.0',
      statement_code: 'UNCAPTURED_POTENTIAL', evidence_refs: ['axes/policy_capture/uncaptured_potential_brl'],
    }]} limitations={[{
      code: 'COST_NOT_OBSERVED', severity: 'WARNING', condition: 'custos sintéticos', evidence_refs: ['provenance/costs'],
    }]} />);
    expect([...container.querySelectorAll('.diagnostic-axis > h2')].map((heading) => heading.textContent)).toEqual([
      '1. Potencial estrutural', '2. Captura pela política', '3. Compatibilidade temporal',
      '4. Exposição residual', '5. Dependência da composição', '6. Robustez econômica',
      '7. Perfil operacional da carteira',
    ]);
    const capture = screen.getByRole('region', { name: '2. Captura pela política' });
    expect(within(capture).getByText(/quanto do potencial/i)).toBeVisible();
    expect(within(capture).getByText('UNCAPTURED_POTENTIAL')).toBeVisible();
    expect(within(capture).getByText('axes/policy_capture/uncaptured_potential_brl')).toBeVisible();
    expect(screen.getByText('COST_NOT_OBSERVED')).toBeVisible();
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
  });

  it('não cria gráfico nem zeros para robustez indisponível', () => {
    const unavailable = { state: 'INSUFFICIENT_COVERAGE' as const, reason: 'FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION', evidence: [] };
    render(<DiagnosticDistribution
      statistics={{ kind: 'SINGLE_EXECUTION', count: 1, selected_repetition_id: '00000000-0000-4000-8000-000000000001', percentile_method: null }}
      repetitions={[]}
      economics={{ baseline_brl: unavailable, netted_brl: unavailable, savings_brl: unavailable, netability_fraction: unavailable }}
    />);
    expect(screen.getByText(/distribuição indisponível/i)).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
