import { describe, expect, it } from 'vitest';

import { DemoInstallSkippedError, InvalidDocumentError } from '../storage/errors';
import { createStudy, moveStudyToTrash } from '../study/domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeScenarioDraft } from '../study/fixtures';
import type { StudyDocument } from '../study/model';
import type { DemoStudyPackageV1 } from './domain';
import generated from './generated/demo-study.v1.json';
import { installDemoStudy } from './installDemoStudy';

const packageValue = generated as unknown as DemoStudyPackageV1;

describe('installDemoStudy orchestration', () => {
  it('does not load the package when a study exists, including in trash', async () => {
    const study = await createStudy({ id: 'existing', ownerSub: FIXTURE_OWNER, name: 'Meu estudo',
      baseScenario: makeScenarioDraft(), now: FIXTURE_NOW });
    const deleted = await moveStudyToTrash(study, FIXTURE_NOW);
    const studies = [deleted];
    const result = await installDemoStudy({
      repository: {
        listStudies: async (options) => options?.includeDeleted ? studies : [],
        installDemoStudy: async () => { studies.push(study); return study; },
      },
      mode: 'FIRST_EMPTY_SESSION', operationId: () => 'auto',
      loadPackage: async () => { throw new Error('package must remain lazy'); },
    });
    expect(result).toBeNull();
    expect(studies).toEqual([deleted]);
  });

  it('treats only the typed eligibility skip as a no-op', async () => {
    const result = await installDemoStudy({
      repository: {
        listStudies: async () => [],
        installDemoStudy: async () => { throw new DemoInstallSkippedError(); },
      },
      mode: 'FIRST_EMPTY_SESSION', operationId: () => 'auto', loadPackage: async () => packageValue,
    });
    expect(result).toBeNull();
  });

  it.each([
    new InvalidDocumentError('Pacote inválido'),
    new Error('QuotaExceededError'),
    Object.assign(new Error('erro não tipado'), { code: 'DEMO_INSTALL_SKIPPED' }),
  ])('propagates installation failures without disguising them as skipped: %s', async (error) => {
    await expect(installDemoStudy({
      repository: {
        listStudies: async () => [],
        installDemoStudy: async () => { throw error; },
      },
      mode: 'FIRST_EMPTY_SESSION', operationId: () => 'auto', loadPackage: async () => packageValue,
    })).rejects.toBe(error);
  });

  it('explicit restore reaches the repository even when other studies exist', async () => {
    const existing = await createStudy({ id: 'existing', ownerSub: FIXTURE_OWNER, name: 'Meu estudo',
      baseScenario: makeScenarioDraft(), now: FIXTURE_NOW });
    const studies: StudyDocument[] = [existing];
    const result = await installDemoStudy({
      repository: {
        listStudies: async () => studies,
        installDemoStudy: async (input) => {
          if (input.mode !== 'EXPLICIT_RESTORE' || input.operationId !== 'restore') throw new Error('wrong mutation');
          studies.push(input.package.study);
          return input.package.study;
        },
      },
      mode: 'EXPLICIT_RESTORE', operationId: () => 'restore', loadPackage: async () => packageValue,
    });
    expect(result?.id).toBe(packageValue.study.id);
    expect(studies).toHaveLength(2);
    expect(studies[0]).toEqual(existing);
  });
});
