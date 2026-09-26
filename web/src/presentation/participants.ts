import { participantNames } from '../hypotheses/participantNames';
import type { StudyController } from '../study/studyController';
import type { StudyDocument } from '../study/model';

/** Nomes legíveis dos participantes da execução; vazio quando a origem não tem composição gerável. */
export async function presentationParticipantNames(
  study: StudyDocument,
  executionId: string,
  controller: Pick<StudyController, 'listCompanies' | 'listOperationalProfileVersions'>,
): Promise<Record<string, string>> {
  const execution = study.executions.find((item) => item.id === executionId);
  const input = execution?.sourceSnapshot?.generationInputSnapshot;
  if (input === undefined) return {};
  const [companies, profiles] = await Promise.all([controller.listCompanies(), controller.listOperationalProfileVersions()]);
  const names = participantNames(input, [...profiles, ...study.evidenceSnapshots.map((item) => item.profile)], companies);
  return Object.fromEntries([...names].map(([id, label]) => [id, label.name]));
}
