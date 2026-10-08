import { describe, expect, it } from 'vitest';

import { validateReplayDocument } from '../api/validators';
import { calculateOperationalProfile } from '../profiles/calculateOperationalProfile';
import { validateStudyDocument } from '../study/validation';
import type { DeepMutable } from '../study/model';
import type { DemoStudyPackageV1 } from './domain';
import generated from './generated/demo-study.v1.json';
import { materializeDemoPackage, snapshotDemoPackage } from './materializeDemoPackage';

const source = generated as unknown as DemoStudyPackageV1;
const owner = 'demo-owner';

describe('materializeDemoPackage', { timeout: 30_000 }, () => {
  it('materializes a valid independent installation without changing engine results', async () => {
    const before = JSON.stringify(source);
    const result = await materializeDemoPackage(source, owner, 'installation-one');
    expect(result.study.ownerSub).toBe(owner);
    expect(result.study.id).not.toBe(source.study.id);
    expect(await validateStudyDocument(result.study, owner)).toMatchObject({ ok: true });
    for (const [index, profile] of result.profiles.entries()) {
      const original = source.profiles[index]!;
      expect(profile.ownerSub).toBe(owner);
      expect(profile.id).not.toBe(original.id);
      const selected = result.observedCases.filter((item) =>
        profile.selectedCases.some((selection) => selection.caseId === item.id));
      expect(profile).toEqual(await calculateOperationalProfile({
        id: profile.id, ownerSub: owner, companyId: profile.companyId,
        version: profile.version, createdAt: profile.createdAt, cases: selected,
      }));
      expect(result.study.evidenceSnapshots[index]!.profile).toEqual(profile);
      expect(result.companies.some((company) => company.id === profile.companyId
        && company.ownerSub === owner)).toBe(true);
    }
    for (const [index, execution] of result.study.executions.entries()) {
      expect(execution.id).not.toBe(source.study.executions[index]!.id);
      if (execution.kind !== 'DIAGNOSTIC' || execution.envelope === null) continue;
      const original = source.study.executions[index]!;
      if (original.kind !== 'DIAGNOSTIC' || original.envelope === null) throw new Error('fixture');
      expect(execution.envelope.selected_execution.result).toEqual(original.envelope.selected_execution.result);
      expect(execution.envelope.selected_execution.execution_fingerprint)
        .toBe(original.envelope.selected_execution.execution_fingerprint);
      expect(execution.envelope.repetitions).toEqual(original.envelope.repetitions);
      const replay = result.replays[execution.scenarioId]!;
      expect(validateReplayDocument(replay)).toBe(true);
      expect(replay.diagnostic_execution_id).toBe(execution.id);
      expect(replay.scenario_id).toBe(execution.scenarioId);
      expect(replay.totals).toEqual(source.replays[original.scenarioId]!.totals);
    }
    const json = JSON.stringify(result);
    expect(json).not.toContain('$OWNER_SUB');
    for (const profile of source.profiles) expect(json).not.toContain(profile.id);
    for (const item of source.observedCases) expect(json).not.toContain(item.id);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('repeats deterministically and isolates owner and installation namespaces', async () => {
    const first = await materializeDemoPackage(source, owner, 'installation-one');
    const repeated = await materializeDemoPackage(source, owner, 'installation-one');
    expect(repeated).toEqual(first);
    for (const other of [
      await materializeDemoPackage(source, owner, 'installation-two'),
      await materializeDemoPackage(source, 'another-owner', 'installation-one'),
    ]) {
      const firstIds = new Set([first.study.id, ...first.companies.map((item) => item.id),
        ...first.observedCases.map((item) => item.id), ...first.profiles.map((item) => item.id),
        ...first.study.scenarios.map((item) => item.id), ...first.study.executions.map((item) => item.id)]);
      expect([other.study.id, ...other.companies.map((item) => item.id),
        ...other.observedCases.map((item) => item.id), ...other.profiles.map((item) => item.id),
        ...other.study.scenarios.map((item) => item.id), ...other.study.executions.map((item) => item.id)]
        .some((id) => firstIds.has(id))).toBe(false);
    }
  });

  it('snapshots the complete input before asynchronous hashing yields', async () => {
    const candidate = structuredClone(source) as DeepMutable<DemoStudyPackageV1>;
    const pending = materializeDemoPackage(candidate, owner, 'installation-one');
    candidate.companies[0]!.displayName = 'MUTATED AFTER CALL';
    candidate.study.scenarios.length = 0;
    const result = await pending;
    expect(result.companies[0]!.displayName).toBe(source.companies[0]!.displayName);
    expect(result.study.scenarios).toHaveLength(5);
  });

  it.each(['raw-array', 'getter', 'symbol', 'hidden', 'inherited', 'cycle', 'partial', 'profile-link'])
  ('rejects %s without silently sanitizing a partial or invalid input', async (kind) => {
    const candidate = structuredClone(source) as DeepMutable<DemoStudyPackageV1>;
    if (kind === 'raw-array') Object.assign(candidate.companies, { raw: 'PRIVATE RAW CELL' });
    if (kind === 'getter') Object.defineProperty(candidate, 'private', { enumerable: true, get: () => 'PRIVATE' });
    if (kind === 'symbol') Object.assign(candidate, { [Symbol('private')]: 'PRIVATE' });
    if (kind === 'hidden') Object.defineProperty(candidate, 'private', { value: 'PRIVATE' });
    if (kind === 'inherited') Object.setPrototypeOf(candidate, { private: 'PRIVATE' });
    if (kind === 'cycle') Object.assign(candidate, { cycle: candidate });
    if (kind === 'partial') candidate.observedCases.pop();
    if (kind === 'profile-link') candidate.observedCases[0]!.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await expect(materializeDemoPackage(candidate, owner, 'installation-one')).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
  });

  it('rejects inherited array data before snapshotting', () => {
    const candidate = structuredClone(source);
    Object.setPrototypeOf(candidate.companies, Object.assign(Object.create(Array.prototype), { raw: 'PRIVATE' }));
    expect(() => snapshotDemoPackage(candidate)).toThrowError(/inválido/);
  });

  it('rejects profile provenance that points outside the installation package', async () => {
    const candidate = structuredClone(source) as DeepMutable<DemoStudyPackageV1>;
    const sources = candidate.study.scenarios[0]!.sourceSnapshot.generationInputSnapshot!.sources;
    const reference = Object.values(sources).find((item) => item.source.startsWith('profile-mvp:'))!;
    reference.source = `profile-mvp:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@${'a'.repeat(64)}:derived`;
    await expect(materializeDemoPackage(candidate, owner, 'installation-one'))
      .rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
  });

  it.each([['', 'installation-one'], ['$OWNER_SUB', 'installation-one'], [owner, '']])
  ('rejects invalid owner/installation identity %s %s', async (ownerSub, installationId) => {
    await expect(materializeDemoPackage(source, ownerSub, installationId))
      .rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
  });
});
