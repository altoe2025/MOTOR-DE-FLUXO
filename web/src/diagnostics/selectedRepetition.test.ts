import { describe, expect, it } from 'vitest';

import type { DiagnosticEnvelope } from '../api/client';
import { describeSelectedRepetition } from './selectedRepetition';

function envelope(kind: 'DISTRIBUTION' | 'SINGLE_EXECUTION'): DiagnosticEnvelope {
  const repetitionId = '00000000-0000-4000-8000-000000000703';
  return {
    statistics: kind === 'DISTRIBUTION'
      ? { kind, count: 10, selected_repetition_id: repetitionId, percentile_method: 'EMPIRICAL_NEAREST_RANK' }
      : { kind, count: 1, selected_repetition_id: repetitionId, percentile_method: null },
    selected_execution: { statistics: { repetition_id: repetitionId } },
    repetitions: [{ repetition_id: repetitionId }],
  } as DiagnosticEnvelope;
}

describe('descrição da repetição selecionada', () => {
  it('descreve seleção planejada sem alegar mediana da distribuição', () => {
    expect(describeSelectedRepetition(envelope('DISTRIBUTION'))).toEqual({
      repetitionId: '00000000-0000-4000-8000-000000000703', total: 10,
      criterion: 'Primeira repetição do plano, definida antes da execução.',
    });
  });

  it('distingue a única execução de entrada fixa', () => {
    expect(describeSelectedRepetition(envelope('SINGLE_EXECUTION'))).toEqual({
      repetitionId: '00000000-0000-4000-8000-000000000703', total: 1,
      criterion: 'Única execução da entrada fixa.',
    });
  });

  it('não chama de primeira uma repetição selecionada em outra posição', () => {
    const selected = { ...envelope('DISTRIBUTION'), repetitions: [
      { repetition_id: 'outro-id' }, { repetition_id: '00000000-0000-4000-8000-000000000703' },
    ] } as unknown as DiagnosticEnvelope;
    expect(describeSelectedRepetition(selected).criterion).toBe('Repetição indicada no plano do diagnóstico antes da execução.');
  });

  it('rejeita identidade incoerente entre seleção e execução', () => {
    const inconsistent = envelope('DISTRIBUTION');
    inconsistent.selected_execution.statistics.repetition_id = 'outro-id';
    expect(() => describeSelectedRepetition(inconsistent)).toThrow(/não corresponde/i);
  });
});
