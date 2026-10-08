import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../api/client';
import { describeSelectedRepetition } from './selectedRepetition';

const SELECTED = '00000000-0000-4000-8000-000000000703';

function envelope(kind: 'DISTRIBUTION' | 'SINGLE_EXECUTION', savings: readonly string[] = ['5'], p50 = '5'): DiagnosticEnvelope {
  const ids = savings.map((_, index) => index === savings.length - 1 ? SELECTED : `00000000-0000-4000-8000-00000000070${index}`);
  return {
    statistics: kind === 'DISTRIBUTION'
      ? { kind, count: 10, selected_repetition_id: SELECTED, percentile_method: 'EMPIRICAL_NEAREST_RANK' }
      : { kind, count: 1, selected_repetition_id: SELECTED, percentile_method: null },
    selected_execution: { statistics: { repetition_id: SELECTED } },
    repetitions: ids.map((repetition_id, index) => ({ repetition_id, savings_brl: savings[index] })),
    axes: { economic_robustness: { savings_brl: kind === 'DISTRIBUTION'
      ? { state: 'AVAILABLE', value: { p50 } }
      : { state: 'INSUFFICIENT_COVERAGE', reason: 'FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION' } } },
  } as unknown as DiagnosticEnvelope;
}

describe('descrição da repetição selecionada', () => {
  it('identifica a repetição da mediana da economia e sua posição', () => {
    expect(describeSelectedRepetition(envelope('DISTRIBUTION', ['1', '9', '5'], '5'))).toEqual({
      repetitionId: SELECTED, total: 10, position: 3,
      criterion: 'Repetição da mediana da economia (P50) entre as carteiras simuladas.',
    });
  });

  it('distingue a única execução de entrada fixa', () => {
    expect(describeSelectedRepetition(envelope('SINGLE_EXECUTION'))).toEqual({
      repetitionId: SELECTED, total: 1, position: 1,
      criterion: 'Única execução da entrada fixa.',
    });
  });

  it('não chama de mediana a seleção de diagnóstico antigo feita pelo plano', () => {
    const old = envelope('DISTRIBUTION', ['5'], '9');
    expect(describeSelectedRepetition(old).criterion).toBe('Primeira repetição do plano, definida antes da execução (diagnóstico anterior à escolha pela mediana).');
    const elsewhere = envelope('DISTRIBUTION', ['1', '5'], '9');
    expect(describeSelectedRepetition(elsewhere).criterion).toBe('Repetição indicada no plano do diagnóstico antes da execução.');
  });

  it('rejeita identidade incoerente entre seleção e execução', () => {
    const inconsistent = envelope('DISTRIBUTION');
    inconsistent.selected_execution.statistics.repetition_id = 'outro-id';
    expect(() => describeSelectedRepetition(inconsistent)).toThrow(/não corresponde/i);
  });
});
