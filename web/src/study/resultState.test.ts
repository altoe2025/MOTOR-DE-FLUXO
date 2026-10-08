import { describe, expect, it } from 'vitest';

import { createStudy } from './domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeScenarioDraft } from './fixtures';
import type { ExecutionRecord } from './model';
import { deriveResultState } from './resultState';

async function scenario() {
  const study = await createStudy({
    id: 'study-1', ownerSub: FIXTURE_OWNER, name: 'Estudo',
    baseScenario: makeScenarioDraft(), now: FIXTURE_NOW,
  });
  return study.scenarios[0]!;
}

function execution(
  current: Awaited<ReturnType<typeof scenario>>,
  overrides: Partial<ExecutionRecord> = {},
): ExecutionRecord {
  return {
    id: 'execution-1',
    scenarioId: current.id,
    scenarioRevision: current.revision,
    inputFingerprint: current.inputFingerprint,
    requestSnapshot: {} as ExecutionRecord['requestSnapshot'],
    engineVersion: 'build-1',
    contractVersion: '1.0.0',
    status: 'RUNNING',
    envelope: null,
    observedComparison: null,
    createdAt: FIXTURE_NOW,
    finishedAt: null,
    ...overrides,
  };
}

describe('deriveResultState', () => {
  it('retorna ausente sem execução', async () => {
    expect(deriveResultState(await scenario(), null)).toEqual({ kind: 'ABSENT' });
  });

  it('retorna atual quando revisão e fingerprint coincidem', async () => {
    const current = await scenario();
    expect(deriveResultState(current, execution(current))).toEqual({
      kind: 'CURRENT', executionId: 'execution-1', status: 'RUNNING',
    });
  });

  it('explica fingerprint e revisão desatualizados sem alterar a execução', async () => {
    const current = await scenario();
    const old = execution(current, { scenarioRevision: 0, inputFingerprint: 'a'.repeat(64) });
    const before = structuredClone(old);

    expect(deriveResultState(current, old)).toEqual({
      kind: 'STALE',
      executionId: 'execution-1',
      reasons: ['INPUT_CHANGED', 'SCENARIO_REVISION_CHANGED'],
    });
    expect(old).toEqual(before);
  });
});
