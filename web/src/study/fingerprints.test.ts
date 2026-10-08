import { describe, expect, it } from 'vitest';

import { fingerprintPortfolioSource, fingerprintScenarioInput } from './fingerprints';
import {
  makeObservedOutcome,
  makeObservedSnapshot,
  makeScenarioDraft,
  makeSyntheticSnapshot,
} from './fixtures';
import type { DeepMutable } from './model';

const syntheticField = (source: string) => ({
  kind: 'DERIVED' as const,
  source,
  version: '1.0.0',
  recordedAt: '2026-09-19T12:00:00Z',
  rule: 'dimensionamento-v1',
  inputs: ['/participants/example/profile'],
});

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
    changedSeed.sourceSnapshot.source.recipe.seeds = ['2'];
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

  it('distingue seeds int64 adjacentes e composição realizada', async () => {
    const scenario = makeScenarioDraft();
    if (scenario.sourceSnapshot.source.kind !== 'SYNTHETIC') throw new Error('fixture');
    scenario.sourceSnapshot.source.recipe.seeds = ['9223372036854775806'];
    const initial = await fingerprintScenarioInput(scenario);

    scenario.sourceSnapshot.source.recipe.seeds = ['9223372036854775807'];
    const changedSeed = await fingerprintScenarioInput(scenario);
    expect(changedSeed).not.toBe(initial);

    scenario.sourceSnapshot.source.recipe.composition[0]!.total_brl = '171';
    expect(await fingerprintScenarioInput(scenario)).not.toBe(changedSeed);
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

  it('inclui proveniência por ordem em snapshots sintéticos novos', async () => {
    const snapshot = makeSyntheticSnapshot();
    snapshot.provenanceByOrder = {
      'order-a': {
        dia_conhecida: syntheticField('perfil-a'), dia_limite: syntheticField('perfil-a'),
        eh_efx: syntheticField('perfil-a'), finalidade: syntheticField('perfil-a'),
        valor_brl: syntheticField('perfil-a'),
      },
      'order-b': {
        dia_conhecida: syntheticField('perfil-b'), dia_limite: syntheticField('perfil-b'),
        eh_efx: syntheticField('perfil-b'), finalidade: syntheticField('perfil-b'),
        valor_brl: syntheticField('perfil-b'),
      },
    };
    const initial = await fingerprintPortfolioSource(snapshot);
    const swapped = structuredClone(snapshot);
    swapped.provenanceByOrder = {
      'order-a': structuredClone(snapshot.provenanceByOrder['order-b']!),
      'order-b': structuredClone(snapshot.provenanceByOrder['order-a']!),
    };

    expect(await fingerprintPortfolioSource(swapped)).not.toBe(initial);
    expect(await fingerprintScenarioInput(makeScenarioDraft({ sourceSnapshot: swapped })))
      .not.toBe(await fingerprintScenarioInput(makeScenarioDraft({ sourceSnapshot: snapshot })));
  });
});
