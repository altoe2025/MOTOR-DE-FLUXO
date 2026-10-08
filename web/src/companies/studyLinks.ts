import type { OperationalProfileVersion } from '../profiles/domain';
import type { StudyDocument } from '../study/model';

export type HistoricalStudyLink = Readonly<{
  studyId: string;
  studyName: string;
  revisions: readonly number[];
}>;

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

export function findCaseStudyLinks(
  ownerSub: string,
  caseId: string,
  studies: readonly StudyDocument[],
): HistoricalStudyLink[] {
  return studies
    .filter((study) => study.ownerSub === ownerSub && study.deletedAt === null)
    .flatMap((study) => {
      const revisions = uniqueSorted(study.executions.flatMap((execution) => {
        const source = execution.sourceSnapshot?.source;
        return source?.kind === 'OBSERVED_CASE' && source.caseId === caseId
          ? [source.caseRevision]
          : [];
      }));
      return revisions.length === 0
        ? []
        : [{ studyId: study.id, studyName: study.name, revisions }];
    })
    .sort((left, right) => left.studyName.localeCompare(right.studyName, 'pt-BR')
      || left.studyId.localeCompare(right.studyId));
}

export function findProfileStudyLinks(
  profile: OperationalProfileVersion,
  studies: readonly StudyDocument[],
): HistoricalStudyLink[] {
  return studies
    .filter((study) => study.ownerSub === profile.ownerSub && study.deletedAt === null)
    .flatMap((study) => {
      const revisions = uniqueSorted(study.evidenceSnapshots.flatMap((snapshot) =>
        snapshot.profile.id === profile.id
          && snapshot.profile.documentFingerprint === profile.documentFingerprint
          && snapshot.profile.ownerSub === profile.ownerSub
          ? [snapshot.profile.version]
          : []));
      return revisions.length === 0
        ? []
        : [{ studyId: study.id, studyName: study.name, revisions }];
    })
    .sort((left, right) => left.studyName.localeCompare(right.studyName, 'pt-BR')
      || left.studyId.localeCompare(right.studyId));
}
