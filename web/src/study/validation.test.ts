import { describe, expect, it } from 'vitest';

import referenceRequest from '../../../contracts/fixtures/reference-request.json';
import referenceResult from '../../../contracts/fixtures/reference-result.json';
import { createStudy } from './domain';
import { FIXTURE_NOW, FIXTURE_OWNER, makeScenarioDraft } from './fixtures';
import type {
  DeepMutable,
  ExecutionRecord,
  PreviaRequest,
  PreviewEnvelope,
  StudyDocument,
} from './model';
import { validateExecutionRecord, validateStudyDocument } from './validation';

async function makeStudy(): Promise<StudyDocument> {
  return createStudy({
    id: '00000000-0000-4000-8000-000000000020',
    ownerSub: FIXTURE_OWNER,
    name: 'Estudo válido',
    baseScenario: makeScenarioDraft(),
    now: FIXTURE_NOW,
  });
}

function succeededExecution(study: StudyDocument): DeepMutable<ExecutionRecord> {
  const scenario = study.scenarios[0]!;
  const request = structuredClone(referenceRequest) as PreviaRequest;
  const envelope = structuredClone(referenceResult) as PreviewEnvelope;
  const mutableRequest = request as DeepMutable<PreviaRequest>;
  const mutableEnvelope = envelope as DeepMutable<PreviewEnvelope>;
  mutableRequest.study_id = study.id;
  mutableRequest.scenario_id = scenario.id;
  mutableRequest.scenario_revision = scenario.revision;
  mutableEnvelope.execution_id = '00000000-0000-4000-8000-000000000030';
  mutableEnvelope.study_id = study.id;
  mutableEnvelope.scenario_id = scenario.id;
  mutableEnvelope.scenario_revision = scenario.revision;
  mutableEnvelope.input_snapshot = {
    cenario: structuredClone(request.cenario) as DeepMutable<typeof request.cenario>,
    periodo: structuredClone(request.periodo) as DeepMutable<typeof request.periodo>,
    proveniencia: structuredClone(request.proveniencia) as DeepMutable<typeof request.proveniencia>,
  };
  return {
    id: mutableEnvelope.execution_id,
    scenarioId: scenario.id,
    scenarioRevision: scenario.revision,
    inputFingerprint: scenario.inputFingerprint,
    requestSnapshot: mutableRequest,
    engineVersion: mutableEnvelope.motor_build_sha,
    contractVersion: mutableEnvelope.api_version,
    status: 'SUCCEEDED',
    envelope: mutableEnvelope,
    observedComparison: null,
    createdAt: FIXTURE_NOW,
    finishedAt: '2026-09-19T12:01:00Z',
  };
}

describe('validateStudyDocument', () => {
  it('aceita o agregado v2 e rejeita campo extra', async () => {
    const study = await makeStudy();

    expect(await validateStudyDocument(study)).toEqual({ ok: true, value: study });
    expect((await validateStudyDocument({ ...study, injected: true })).ok).toBe(false);
  });

  it('rejeita owner divergente e cenário base ausente', async () => {
    const study = await makeStudy();
    const owner = await validateStudyDocument(
      study,
      '00000000-0000-4000-8000-000000000099',
    );
    const missing = await validateStudyDocument({ ...study, baseScenarioId: 'missing' });

    expect(owner).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'OWNER_MISMATCH' })],
    });
    expect(missing).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'BASE_SCENARIO_MISSING' })],
    });
  });

  it('rejeita execução ligada a revisão inexistente', async () => {
    const study = await makeStudy();
    const execution = succeededExecution(study);
    execution.scenarioRevision = 2;
    execution.requestSnapshot.scenario_revision = 2;
    execution.envelope!.scenario_revision = 2;

    const result = await validateStudyDocument({ ...study, executions: [execution] });

    expect(result).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'MISSING_SCENARIO_REVISION' })],
    });
  });

  it('rejeita envelope incompatível com registro, request e estudo', async () => {
    const study = await makeStudy();
    const execution = succeededExecution(study);
    expect(validateExecutionRecord(execution, study)).toEqual({ ok: true, value: execution });
    execution.envelope!.request_id = '00000000-0000-4000-8000-000000000099';

    const result = validateExecutionRecord(execution, study);

    expect(result).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'INCOMPATIBLE_ENVELOPE' })],
    });
  });

  it('aceita precisão ISO equivalente normalizada pelo servidor', async () => {
    const study = await makeStudy();
    const execution = succeededExecution(study);
    const path = Object.keys(execution.requestSnapshot.proveniencia)[0]!;
    execution.requestSnapshot.proveniencia[path]!.registrado_em_utc = '2026-09-19T12:00:00.123Z';
    execution.envelope!.input_snapshot.proveniencia[path]!.registrado_em_utc = '2026-09-19T12:00:00.123000Z';

    expect(validateExecutionRecord(execution, study)).toEqual({ ok: true, value: execution });
  });

  it('rejeita adulteração de sourceFingerprint e inputFingerprint persistidos', async () => {
    const study = await makeStudy();
    const sourceTampered = structuredClone(study) as DeepMutable<StudyDocument>;
    sourceTampered.scenarios[0]!.sourceSnapshot.sourceFingerprint = '0'.repeat(64);
    const sourceResult = await validateStudyDocument(sourceTampered);
    expect(sourceResult.ok).toBe(false);
    if (sourceResult.ok) throw new Error('adulteração de origem deveria falhar');
    expect(sourceResult.issues).toContainEqual(expect.objectContaining({
      code: 'SOURCE_FINGERPRINT_MISMATCH',
    }));

    const inputTampered = structuredClone(study) as DeepMutable<StudyDocument>;
    inputTampered.scenarios[0]!.inputFingerprint = '0'.repeat(64);
    const inputResult = await validateStudyDocument(inputTampered);
    expect(inputResult.ok).toBe(false);
    if (inputResult.ok) throw new Error('adulteração de input deveria falhar');
    expect(inputResult.issues).toContainEqual(expect.objectContaining({
      code: 'INPUT_FINGERPRINT_MISMATCH',
    }));
  });
});
