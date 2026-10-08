import { describe, expect, it } from 'vitest';

import type { OperationalProfileVersion } from '../profiles/domain';
import type { StudyDocument } from '../study/model';
import { findCaseStudyLinks, findProfileStudyLinks } from './studyLinks';

function study(input: Partial<StudyDocument>): StudyDocument {
  return {
    schemaVersion: '3.0.0', id: 'study-1', ownerSub: 'owner-1', name: 'Estudo A', revision: 1,
    baseScenarioId: 'scenario-1', scenarios: [], executions: [], evidenceSnapshots: [],
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deletedAt: null, ...input,
  } as StudyDocument;
}

describe('historical study links', () => {
  it('lista todas as revisões históricas do caso preservadas em execuções', () => {
    const linked = study({
      executions: [
        { kind: 'PREVIEW', sourceSnapshot: { source: { kind: 'OBSERVED_CASE', caseId: 'case-1', caseRevision: 2 } } },
        { kind: 'PREVIEW', sourceSnapshot: { source: { kind: 'OBSERVED_CASE', caseId: 'case-1', caseRevision: 4 } } },
      ] as unknown as StudyDocument['executions'],
    });
    const mutableOnly = study({
      id: 'mutable-only', name: 'Não histórico',
      scenarios: [{ sourceSnapshot: { source: { kind: 'OBSERVED_CASE', caseId: 'case-1', caseRevision: 7 } } }] as unknown as StudyDocument['scenarios'],
    });
    expect(findCaseStudyLinks('owner-1', 'case-1', [mutableOnly, linked])).toEqual([
      { studyId: 'study-1', studyName: 'Estudo A', revisions: [2, 4] },
    ]);
  });

  it('vincula perfil somente pela cópia imutável anexada ao estudo', () => {
    const snapshotProfile = {
      id: 'profile-1', ownerSub: 'owner-1', companyId: 'company-1', version: 3,
      documentFingerprint: 'fingerprint-1',
    } as OperationalProfileVersion;
    const linked = study({
      evidenceSnapshots: [{ kind: 'OPERATIONAL_PROFILE', capturedAt: '2026-01-02T00:00:00Z', profile: snapshotProfile }],
    });
    expect(findProfileStudyLinks(snapshotProfile, [linked])).toEqual([
      { studyId: 'study-1', studyName: 'Estudo A', revisions: [3] },
    ]);
    expect(findProfileStudyLinks({ ...snapshotProfile, ownerSub: 'owner-2' }, [linked])).toEqual([]);
  });
});
