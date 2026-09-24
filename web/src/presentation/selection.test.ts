import { describe, expect, it } from 'vitest';

import { comparisonInput, observedInput } from '../communication/testFixtures';
import { resolvePresentationSelection } from './selection';

describe('seleção explícita da apresentação', () => {
  it('aceita apenas a execução concluída da conta e cenário solicitados', async () => {
    const input = await observedInput();
    const result = resolvePresentationSelection(input.study, input.study.ownerSub,
      input.scenarioId, input.diagnosticExecutionId);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.diagnosticExecutionId).toBe(input.diagnosticExecutionId);
  });

  it('recusa parâmetros ausentes, outro owner, cenário removido e execução incompatível', async () => {
    const input = await observedInput();
    const scenarios = [
      [input.study, input.study.ownerSub, null, input.diagnosticExecutionId],
      [input.study, input.study.ownerSub, input.scenarioId, null],
      [input.study, 'outra-conta', input.scenarioId, input.diagnosticExecutionId],
      [{ ...input.study, scenarios: [] }, input.study.ownerSub, input.scenarioId, input.diagnosticExecutionId],
      [input.study, input.study.ownerSub, input.scenarioId, '40000000-0000-4000-8000-000000000002'],
    ] as const;
    for (const [study, owner, scenario, execution] of scenarios) {
      expect(resolvePresentationSelection(study, owner, scenario, execution).ok).toBe(false);
    }
  });

  it('preserva o par explícito da comparação na publicação', async () => {
    const input = await comparisonInput();
    const hypothesis = input.study.executions.find((item) => item.id === input.comparisonExecutionId)!;
    const result = resolvePresentationSelection(input.study, input.study.ownerSub,
      hypothesis.scenarioId, hypothesis.id, { comparisonExecutionId: input.diagnosticExecutionId });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.comparisonExecutionId).toBe(input.diagnosticExecutionId);
      expect(result.input.comparison?.baseExecutionId).toBe(input.diagnosticExecutionId);
      expect(result.input.comparison?.hypothesisExecutionId).toBe(hypothesis.id);
    }
  });

  it('recusa comparação incompatível em vez de voltar ao diagnóstico simples', async () => {
    const input = await comparisonInput();
    const hypothesis = input.study.executions.find((item) => item.id === input.comparisonExecutionId)!;
    for (const other of [hypothesis.id, 'execucao-ausente']) {
      expect(resolvePresentationSelection(input.study, input.study.ownerSub,
        hypothesis.scenarioId, hypothesis.id, { comparisonExecutionId: other }).ok).toBe(false);
    }
  });

  it('distingue Replay ausente de dia explícito e recusa dia inválido', async () => {
    const input = await observedInput();
    const absent = resolvePresentationSelection(input.study, input.study.ownerSub,
      input.scenarioId, input.diagnosticExecutionId);
    expect(absent.ok).toBe(true);
    if (absent.ok) expect(absent.input.replayDay).toBeNull();
    expect(resolvePresentationSelection(input.study, input.study.ownerSub,
      input.scenarioId, input.diagnosticExecutionId, { replayDay: -1 }).ok).toBe(false);
  });
});
