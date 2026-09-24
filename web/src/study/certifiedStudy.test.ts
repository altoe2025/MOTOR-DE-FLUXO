import { describe, expect, it, vi } from 'vitest';

import demoJson from '../demo/generated/demo-study.v1.json';
import referenceRequest from '../../../contracts/fixtures/reference-request.json';
import referenceResult from '../../../contracts/fixtures/reference-result.json';
import type { DemoStudyPackageV1 } from '../demo/domain';
import { buildCommunicationDocument } from '../communication/buildCommunicationDocument';
import { comparisonInput, observedInput } from '../communication/testFixtures';
import { validateStoredStudy } from '../storage/migrations';
import { createStudy } from './domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeScenarioDraft } from './fixtures';
import type { DeepMutable, DiagnosticExecutionRecord, PreviaRequest, PreviewEnvelope, PreviewExecutionRecord, StudyDocument } from './model';
import { isCertifiedStudy, validateAndCertifyStudy } from './certifiedStudy';
import * as validation from './validation';

async function certifiedInput() {
  const input = await observedInput();
  return { ...input, study: await validateStoredStudy(input.study, input.study.ownerSub) };
}

async function previewStudy(): Promise<DeepMutable<StudyDocument>> {
  const study = await createStudy({ id: '00000000-0000-4000-8000-000000000020', ownerSub: FIXTURE_OWNER,
    name: 'Estudo PREVIEW', baseScenario: makeScenarioDraft(), now: FIXTURE_NOW });
  const scenario = study.scenarios[0]!;
  const request = structuredClone(referenceRequest) as DeepMutable<PreviaRequest>;
  const envelope = structuredClone(referenceResult) as DeepMutable<PreviewEnvelope>;
  request.study_id = study.id;
  request.scenario_id = scenario.id;
  request.scenario_revision = scenario.revision;
  envelope.execution_id = '00000000-0000-4000-8000-000000000030';
  envelope.study_id = study.id;
  envelope.scenario_id = scenario.id;
  envelope.scenario_revision = scenario.revision;
  envelope.input_snapshot = { cenario: structuredClone(request.cenario),
    periodo: structuredClone(request.periodo), proveniencia: structuredClone(request.proveniencia) };
  const execution: DeepMutable<PreviewExecutionRecord> = {
    kind: 'PREVIEW', id: envelope.execution_id, scenarioId: scenario.id,
    scenarioRevision: scenario.revision, inputFingerprint: scenario.inputFingerprint,
    requestSnapshot: request, engineVersion: envelope.motor_build_sha,
    contractVersion: envelope.api_version, status: 'SUCCEEDED', envelope,
    observedComparison: null, createdAt: FIXTURE_NOW, finishedAt: FIXTURE_NOW,
  };
  return { ...structuredClone(study), executions: [execution] } as DeepMutable<StudyDocument>;
}

describe('certificado efêmero por identidade e divisão persistida', () => {
  it('preserva resultado e ordem integral dos issues entre validador raw e dividido', async () => {
    const input = await observedInput();
    const fingerprint = structuredClone(input.study);
    fingerprint.scenarios[0]!.sourceSnapshot.sourceFingerprint = '0'.repeat(64);
    const envelope = structuredClone(demoJson.study) as DeepMutable<StudyDocument>;
    const terminal = envelope.executions.find((item) => item.kind === 'DIAGNOSTIC' && item.status === 'SUCCEEDED')! as DeepMutable<DiagnosticExecutionRecord>;
    terminal.envelope!.job_id = '00000000-0000-4000-8000-000000000099';
    for (const [value, owner] of [[input.study, input.study.ownerSub], [input.study, 'outro-owner'],
      [fingerprint, fingerprint.ownerSub], [envelope, envelope.ownerSub]] as const) {
      expect(await validation.validateStudyDocumentWithExecutionYield(value, owner))
        .toEqual(await validation.validateStudyDocument(value, owner));
    }
  });

  it('valida integralmente uma vez e produz o mesmo documento', async () => {
    const input = await observedInput();
    const expected = await buildCommunicationDocument(input);
    const study = await validateStoredStudy(input.study, input.study.ownerSub);
    expect(isCertifiedStudy(study, study.ownerSub)).toBe(true);
    const assert = vi.spyOn(validation, 'assertValidStudy');
    expect(await buildCommunicationDocument({ ...input, study })).toEqual(expected);
    expect(assert).not.toHaveBeenCalled();
    assert.mockRestore();
  });

  it('retém issues de owner/fingerprint/envelope/terminal no caminho persistido', async () => {
    const input = await observedInput();
    await expect(validateStoredStudy(input.study, 'outro-owner')).rejects.toThrow('OWNER_MISMATCH');
    const fingerprint = structuredClone(input.study);
    fingerprint.scenarios[0]!.sourceSnapshot.sourceFingerprint = '0'.repeat(64);
    await expect(validateStoredStudy(fingerprint, fingerprint.ownerSub)).rejects.toThrow('SOURCE_FINGERPRINT_MISMATCH');
    const envelope = structuredClone(demoJson.study) as DeepMutable<StudyDocument>;
    const terminal = envelope.executions.find((item) => item.kind === 'DIAGNOSTIC' && item.status === 'SUCCEEDED')! as DeepMutable<DiagnosticExecutionRecord>;
    terminal.envelope!.job_id = '00000000-0000-4000-8000-000000000099';
    await expect(validateStoredStudy(envelope, envelope.ownerSub)).rejects.toThrow('INCOMPATIBLE_ENVELOPE');
    const duplicate = structuredClone(demoJson.study) as DeepMutable<StudyDocument>;
    const first = duplicate.executions.find((item) => item.kind === 'DIAGNOSTIC' && item.status === 'SUCCEEDED')!;
    duplicate.executions.push({ ...structuredClone(first), id: '00000000-0000-4000-8000-000000000099' });
    await expect(validateStoredStudy(duplicate, duplicate.ownerSub)).rejects.toThrow('DUPLICATE_EXECUTION_TERMINAL');
  });

  it('falha como documento corrompido para entrada estruturalmente inválida não clonável', async () => {
    const input = await observedInput();
    await expect(validateStoredStudy({ ...input.study, injected: () => undefined }, input.study.ownerSub))
      .rejects.toThrow('INVALID_STRUCTURE');
  });

  it('captura antes do await e congela profundamente a identidade única', async () => {
    const input = await observedInput();
    const original = input.study.name;
    const pending = validateStoredStudy(input.study, input.study.ownerSub);
    input.study.name = 'Mutado após a chamada';
    const study = await pending;
    expect(study.name).toBe(original);
    expect(Object.isFrozen(study.executions[0]!.requestSnapshot)).toBe(true);
    expect(Object.isFrozen(study.scenarios[0]!.sourceSnapshot.orders)).toBe(true);
    expect(() => { (study as DeepMutable<StudyDocument>).scenarios[0]!.name = 'Adulterado'; }).toThrow();
    expect(isCertifiedStudy(study, study.ownerSub)).toBe(true);
    expect(isCertifiedStudy(study, 'outro-owner')).toBe(false);
  });

  it('não certifica raw, clone, JSON, spread, cast ou propriedade forjada', async () => {
    const input = await certifiedInput();
    const forged = { ...input.study, __certifiedStudy: true } as StudyDocument;
    for (const raw of [structuredClone(input.study), { ...input.study }, JSON.parse(JSON.stringify(input.study))]) {
      expect(isCertifiedStudy(raw, input.study.ownerSub)).toBe(false);
      expect(await buildCommunicationDocument({ ...input, study: raw })).toBeDefined();
      const bad = structuredClone(raw) as DeepMutable<StudyDocument>;
      bad.scenarios[0]!.sourceSnapshot.sourceFingerprint = '0'.repeat(64);
      await expect(buildCommunicationDocument({ ...input, study: bad })).rejects.toThrow('SOURCE_FINGERPRINT_MISMATCH');
    }
    expect(isCertifiedStudy(forged, input.study.ownerSub)).toBe(false);
    await expect(buildCommunicationDocument({ ...input, study: forged })).rejects.toThrow('INVALID_STRUCTURE');
  });

  it('não confunde ausência de owner com identidade certificada', async () => {
    const input = await observedInput();
    const raw = structuredClone(input.study) as DeepMutable<StudyDocument>;
    delete (raw as { ownerSub?: string }).ownerSub;
    raw.scenarios[0]!.sourceSnapshot.sourceFingerprint = '0'.repeat(64);
    expect(isCertifiedStudy(raw, undefined as unknown as string)).toBe(false);
    await expect(buildCommunicationDocument({ ...input, study: raw })).rejects.toThrow('INVALID_STRUCTURE');
    const result = await validateAndCertifyStudy(input.study, undefined as unknown as string);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ code: 'OWNER_MISMATCH' }));
    expect(isCertifiedStudy(input.study, undefined as unknown as string)).toBe(false);
  });

  it('não certifica Map em PREVIEW.observedComparison nem exóticos aninhados', async () => {
    const plain = await previewStudy();
    expect((await validation.validateStudyDocument(plain, plain.ownerSub)).ok).toBe(true);
    for (const exotic of [new Map([['x', 1]]), { nested: new Set([1]) },
      { nested: new Date('2026-09-24T00:00:00Z') }, new (class Comparison { rows = []; })()]) {
      const study = structuredClone(plain) as DeepMutable<StudyDocument>;
      (study.executions[0] as DeepMutable<PreviewExecutionRecord>).observedComparison = exotic as never;
      const result = await validateAndCertifyStudy(study, study.ownerSub);
      expect(result.ok).toBe(false);
      if (result.ok) expect(isCertifiedStudy(result.value, study.ownerSub)).toBe(false);
    }
    const withMap = structuredClone(plain) as DeepMutable<StudyDocument>;
    (withMap.executions[0] as DeepMutable<PreviewExecutionRecord>).observedComparison = new Map() as never;
    await expect(validateStoredStudy(withMap, withMap.ownerSub)).rejects.toThrow('INVALID_STRUCTURE');
  });

  it('preserva comparação, Replay e seleção obsoleta no builder certificado', async () => {
    const comparison = await comparisonInput();
    const comparedStudy = await validateStoredStudy(comparison.study, comparison.study.ownerSub);
    comparison.comparison.value.axes[0]!.base = '999';
    await expect(buildCommunicationDocument({ ...comparison, study: comparedStudy })).rejects.toThrow('Valores da comparação');
    const demo = structuredClone(demoJson) as DeepMutable<DemoStudyPackageV1>;
    const execution = demo.study.executions.find((item) => item.kind === 'DIAGNOSTIC' && item.status === 'SUCCEEDED')! as DeepMutable<DiagnosticExecutionRecord>;
    const input = { study: await validateStoredStudy(demo.study, demo.study.ownerSub), scenarioId: execution.scenarioId,
      diagnosticExecutionId: execution.id, comparisonExecutionId: null,
      replay: demo.replays[execution.scenarioId]!, replayDay: 31 };
    const replay = structuredClone(input.replay);
    replay.totals.measured_gross_brl = '999';
    await expect(buildCommunicationDocument({ ...input, replay })).rejects.toThrow('totais');
    await expect(buildCommunicationDocument({ ...input, scenarioId: 'obsoleto', replay: null, replayDay: null }))
      .rejects.toThrow('Cenário diverge');
  });
});
