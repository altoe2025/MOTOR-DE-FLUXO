import { describe, expect, it } from 'vitest';

import { fingerprintPortfolioSource, fingerprintScenarioInput } from './fingerprints';
import {
  makeObservedOutcome,
  makeObservedSnapshot,
  makeScenarioDraft,
  makeSyntheticSnapshot,
} from './fixtures';
import type { DeepMutable } from './model';

describe('fingerprintScenarioInput', () => {
  it('ignora nome e timestamps de UI, mas inclui premissas', async () => {
    const scenario = makeScenarioDraft();
    const renamed = { ...structuredClone(scenario), name: 'Outro nome' };
    renamed.sourceSnapshot.capturedAt = '2026-09-19T18:00:00Z';

    expect(await fingerprintScenarioInput(renamed))
      .toBe(await fingerprintScenarioInput(scenario));

    const changedPremises = structuredClone(scenario);
    changedPremises.premises.costs.iof_out = '0.04';
    expect(await fingerprintScenarioInput(changedPremises))
      .not.toBe(await fingerprintScenarioInput(scenario));
  });

  it('é estável para a ordem equivalente das ordens e inclui origem, seeds e versões', async () => {
    const scenario = makeScenarioDraft();
    scenario.sourceSnapshot.orders.reverse();
    const reordered = await fingerprintScenarioInput(scenario);
    scenario.sourceSnapshot.orders.reverse();
    expect(reordered).toBe(await fingerprintScenarioInput(scenario));

    const changedSeed = structuredClone(scenario);
    if (changedSeed.sourceSnapshot.source.kind !== 'SYNTHETIC') throw new Error('fixture');
    changedSeed.sourceSnapshot.source.recipe.seeds = [2];
    expect(await fingerprintScenarioInput(changedSeed)).not.toBe(reordered);

    const changedVersion = structuredClone(scenario);
    if (changedVersion.sourceSnapshot.source.kind !== 'SYNTHETIC') throw new Error('fixture');
    changedVersion.sourceSnapshot.source.recipe.generatorVersion = 'dimensionamento-v2';
    expect(await fingerprintScenarioInput(changedVersion)).not.toBe(reordered);
  });

  it('não confunde o fingerprint global com generation_fingerprint', async () => {
    const snapshot = makeSyntheticSnapshot();
    if (snapshot.source.kind !== 'SYNTHETIC') throw new Error('fixture');
    const scenario = makeScenarioDraft({ sourceSnapshot: snapshot });

    const global = await fingerprintScenarioInput(scenario);

    expect(global).toMatch(/^[0-9a-f]{64}$/);
    expect(global).not.toBe(snapshot.source.recipe.generationFingerprint);
  });

  it('fingerprint da origem ignora metadados de captura e inclui conteúdo e revisão observada', async () => {
    const snapshot = makeObservedSnapshot();
    const initial = await fingerprintPortfolioSource(snapshot);
    snapshot.capturedAt = '2026-09-19T19:00:00Z';
    snapshot.observedOutcome = structuredClone(makeObservedOutcome()) as DeepMutable<
      ReturnType<typeof makeObservedOutcome>
    >;
    snapshot.sourceFingerprint = '0'.repeat(64);
    expect(await fingerprintPortfolioSource(snapshot)).toBe(initial);

    if (snapshot.source.kind !== 'OBSERVED_CASE') throw new Error('fixture');
    snapshot.source.caseRevision += 1;
    expect(await fingerprintPortfolioSource(snapshot)).not.toBe(initial);
    snapshot.source.caseRevision -= 1;
    snapshot.orders[0]!.valor_brl = '71';
    expect(await fingerprintPortfolioSource(snapshot)).not.toBe(initial);
  });
});
