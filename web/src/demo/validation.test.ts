import { describe, expect, it } from 'vitest';

import { calculateOperationalProfile } from '../profiles/calculateOperationalProfile';
import { materializeCompositionDraft } from '../hypotheses/composition';
import type { DemoStudyPackageV1 } from './domain';
import generated from './generated/demo-study.v1.json';
import { validateDemoStudyPackage } from './validation';

describe('DemoStudyPackageV1', () => {
  // Production break caught: generated data cannot cross the same validation boundary as user data.
  it('accepts the versioned synthetic package and every embedded document', async () => {
    const result = await validateDemoStudyPackage(generated);
    if (!result.ok) throw new Error(result.issues.join(', '));
    expect(result).toMatchObject({ ok: true });
    expect(generated.mixes.map((item) => item.label)).toEqual([
      'equilibrado', 'retail pesado', 'corporativo pesado',
      'PSP dominante', 'outbound extremo',
    ]);
  });

  // Production break caught: a stale replay remains accepted after selected metrics change.
  it('rejects a replay inconsistent with its diagnostic envelope', async () => {
    const tampered = structuredClone(generated);
    const scenarioId = tampered.study.scenarios[0]!.id;
    tampered.replays[scenarioId as keyof typeof tampered.replays].totals.measured_gross_brl = '1';
    expect(await validateDemoStudyPackage(tampered)).toMatchObject({ ok: false });
  });

  // Production break caught: synthetic provenance is replaced by an observed claim.
  it('rejects an unlabelled or non-synthetic package', async () => {
    const tampered = { ...generated, syntheticWarning: 'resultado observado' };
    expect(await validateDemoStudyPackage(tampered)).toMatchObject({ ok: false });
  });

  // Production break caught: displayed participant counts diverge from the scenario recipe.
  it('rejects realized counts inconsistent with generation input', async () => {
    const tampered = structuredClone(generated);
    tampered.mixes[0]!.realizedCounts.exportador += 1;
    const result = await validateDemoStudyPackage(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('COMPOSITION_REALIZED:0');
  });

  // Production break caught: synthetic profile metrics drift from the public profile calculator.
  it('recomputes profile evidence through the public profile calculator', async () => {
    const typed = generated as unknown as DemoStudyPackageV1;
    for (const profile of typed.profiles) {
      const caseRecord = typed.observedCases.find((item) => item.id === profile.selectedCases[0]?.caseId)!;
      const recomputed = await calculateOperationalProfile({
        id: profile.id, ownerSub: profile.ownerSub, companyId: profile.companyId,
        version: 1, createdAt: profile.createdAt, cases: [caseRecord],
      });
      expect(profile).toEqual(recomputed);
    }
  });

  // Production break caught: demo participants lack profile lineage for guided composition.
  it('opens a composition hypothesis without changing the original profile', async () => {
    const typed = generated as unknown as DemoStudyPackageV1;
    const base = typed.study.scenarios[0]!;
    const participantId = base.sourceSnapshot.generationInputSnapshot!.participants[0]!.id;
    const before = structuredClone(generated.profiles[0]);
    const materialized = await materializeCompositionDraft({
      base,
      evidenceProfiles: typed.profiles,
      recordedAt: generated.generatedAt,
      draft: {
        kind: 'PROFILE_COMPOSITION', name: 'Hipótese sem um participante',
        participantChanges: [{ kind: 'REMOVE_PARTICIPANT', participantId }],
        windowDays: 7, costs: base.premises.costs,
      },
    });
    expect(materialized.input.participants).toHaveLength(11);
    expect(materialized.diff.removed).toEqual([{ participantId }]);
    expect(generated.profiles[0]).toEqual(before);
  });
});
