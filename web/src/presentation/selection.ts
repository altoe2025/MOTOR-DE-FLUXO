import type { CommunicationInput } from '../communication/buildCommunicationDocument';
import type { StudyDocument } from '../study/model';

export type PresentationResolution = Readonly<{ ok: true; input: CommunicationInput }>
  | Readonly<{ ok: false; reason: string }>;

export function resolvePresentationSelection(
  study: StudyDocument | null,
  ownerSub: string | null,
  scenarioId: string | null,
  executionId: string | null,
): PresentationResolution {
  if (study === null || ownerSub === null || study.ownerSub !== ownerSub) return {
    ok: false, reason: 'O Estudo não existe ou pertence a outra conta.',
  };
  if (scenarioId === null || executionId === null) return {
    ok: false, reason: 'Selecione um cenário e uma execução concluída no Estudo para apresentar.',
  };
  const scenario = study.scenarios.find((item) => item.id === scenarioId);
  if (scenario === undefined) return {
    ok: false, reason: 'O cenário solicitado não existe mais neste Estudo.',
  };
  const execution = study.executions.find((item) => item.id === executionId);
  if (execution?.kind !== 'DIAGNOSTIC' || execution.status !== 'SUCCEEDED'
    || execution.envelope === null || execution.scenarioId !== scenario.id
    || execution.scenarioRevision !== scenario.revision
    || execution.inputFingerprint !== scenario.inputFingerprint) return {
    ok: false, reason: 'A execução solicitada não corresponde ao cenário atual. Selecione outra execução no Estudo.',
  };
  return { ok: true, input: { study, scenarioId, diagnosticExecutionId: executionId,
    comparisonExecutionId: null, replay: null, replayDay: null } };
}
