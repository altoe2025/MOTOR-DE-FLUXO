import type { CommunicationInput } from '../communication/buildCommunicationDocument';
import { compareMvpDiagnostics } from '../hypotheses/comparison';
import type { StudyDocument } from '../study/model';

export type PresentationResolution = Readonly<{ ok: true; input: CommunicationInput }>
  | Readonly<{ ok: false; reason: string }>;

export function resolvePresentationSelection(
  study: StudyDocument | null,
  ownerSub: string | null,
  scenarioId: string | null,
  executionId: string | null,
  options: Readonly<{ comparisonExecutionId?: string | null; replayDay?: number | null }> = {},
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
  const replayDay = options.replayDay ?? null;
  if (replayDay !== null
    && (!Number.isSafeInteger(replayDay) || replayDay < 0)) return {
    ok: false, reason: 'O dia solicitado para o Replay é inválido.',
  };
  const comparisonExecutionId = options.comparisonExecutionId ?? null;
  let comparison: CommunicationInput['comparison'] = null;
  if (comparisonExecutionId !== null) {
    const base = study.executions.find((item) => item.id === comparisonExecutionId);
    if (base?.kind !== 'DIAGNOSTIC' || base.status !== 'SUCCEEDED' || base.envelope === null
      || base.id === execution.id || base.scenarioId !== study.baseScenarioId
      || execution.scenarioId === study.baseScenarioId
      || !study.scenarios.some((item) => item.id === base.scenarioId
        && item.revision === base.scenarioRevision && item.inputFingerprint === base.inputFingerprint)) return {
      ok: false, reason: 'A comparação solicitada não corresponde às execuções atuais deste Estudo.',
    };
    const compared = compareMvpDiagnostics(base, execution);
    if (!compared.ok) return { ok: false, reason: 'A comparação solicitada não é compatível com esta execução.' };
    comparison = { baseExecutionId: base.id, hypothesisExecutionId: execution.id, value: compared.value };
  }
  return { ok: true, input: { study, scenarioId, diagnosticExecutionId: executionId,
    comparisonExecutionId, comparison, replay: null, replayDay } };
}
