import { describe, expect, it } from 'vitest';

import { observedInput } from '../communication/testFixtures';
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
});
