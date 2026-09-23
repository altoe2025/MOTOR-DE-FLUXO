import source from '../../../contracts/fixtures/communication/observed-source.json';
import { compareMvpDiagnostics } from '../hypotheses/comparison';
import { createStudy } from '../study/domain';
import { fingerprintPortfolioSource, fingerprintScenarioInput } from '../study/fingerprints';
import type { DeepMutable, DiagnosticEnvelope, DiagnosticExecutionRecord, DiagnosticRequest, StudyDocument } from '../study/model';

/** Small, canonical fixed-input publication generated through the Python adapter. */
export async function observedInput() {
  const request = structuredClone(source.request) as DeepMutable<DiagnosticRequest>;
  if (request.sampling.kind !== 'FIXED_INPUT') throw new Error('Fixture fixa esperada.');
  const preview = request.sampling.preview_request;
  const now = '2026-09-23T12:00:00Z';
  const study = await createStudy({ id: request.study_id, ownerSub: 'owner-fixture', name: 'Fixture observada', now,
    baseScenario: { id: request.scenario_id, revision: 1, name: 'Caso observado',
      sourceSnapshot: { source: { kind: 'OBSERVED_CASE', caseId: 'case-fixture', caseRevision: 1 }, capturedAt: now,
        orders: preview.cenario.ordens, provenance: [{ kind: 'OBSERVED', source: 'Fixture manual', version: '1', recordedAt: now }],
        observedOutcome: null, sourceFingerprint: '' },
      premises: { costs: preview.cenario.custo, windowDays: preview.cenario.janela_dias },
      period: { httpPeriod: { modo: 'LEGADO' }, executableHorizonDays: preview.cenario.horizonte_dias },
    } });
  const scenario = study.scenarios[0]!;
  request.input_fingerprint = scenario.inputFingerprint;
  const envelope = structuredClone(source.envelope) as DeepMutable<DiagnosticEnvelope>;
  envelope.request_fingerprint = scenario.inputFingerprint;
  const execution: DeepMutable<DiagnosticExecutionRecord> = {
    kind: 'DIAGNOSTIC', id: '40000000-0000-4000-8000-000000000001', attemptId: '50000000-0000-4000-8000-000000000001',
    scenarioId: scenario.id, scenarioRevision: 1, inputFingerprint: scenario.inputFingerprint,
    requestSnapshot: request, sourceSnapshot: structuredClone(scenario.sourceSnapshot) as DeepMutable<typeof scenario.sourceSnapshot>,
    premisesSnapshot: structuredClone(scenario.premises) as DeepMutable<typeof scenario.premises>, periodSnapshot: structuredClone(scenario.period),
    status: 'SUCCEEDED', jobId: request.idempotency_key, envelope, error: null, createdAt: now, finishedAt: now,
  };
  const reservation = { ...structuredClone(execution), id: '40000000-0000-4000-8000-000000000002', status: 'QUEUED' as const, envelope: null, finishedAt: null };
  const persisted: DeepMutable<StudyDocument> = { ...structuredClone(study), evidenceSnapshots: [],
    scenarios: [structuredClone(scenario) as DeepMutable<typeof scenario>], executions: [reservation, execution] };
  return { study: persisted, execution, scenarioId: scenario.id, diagnosticExecutionId: execution.id,
    comparisonExecutionId: null, replay: null, replayDay: null };
}

export async function comparisonInput() {
  const input = await observedInput();
  const base = input.execution;
  const next = structuredClone(base);
  next.id = '60000000-0000-4000-8000-000000000001';
  next.attemptId = '60000000-0000-4000-8000-000000000002';
  next.scenarioId = '60000000-0000-4000-8000-000000000003';
  next.jobId = '60000000-0000-4000-8000-000000000004';
  next.requestSnapshot.idempotency_key = next.jobId;
  next.requestSnapshot.request_id = '60000000-0000-4000-8000-000000000005';
  next.requestSnapshot.scenario_id = next.scenarioId;
  if (next.requestSnapshot.sampling.kind !== 'FIXED_INPUT' || next.envelope === null) throw new Error('Fixture fixa esperada.');
  next.requestSnapshot.sampling.preview_request.scenario_id = next.scenarioId;
  next.envelope.job_id = next.jobId;
  next.envelope.selected_execution.scenario_id = next.scenarioId;
  input.study.scenarios.push({ ...structuredClone(input.study.scenarios[0]!), id: next.scenarioId });
  input.study.executions.push({ ...structuredClone(next), id: '60000000-0000-4000-8000-000000000006', status: 'QUEUED', envelope: null, finishedAt: null }, next);
  const compared = compareMvpDiagnostics(base, next);
  if (!compared.ok) throw new Error(compared.reason);
  return { ...input, comparisonExecutionId: next.id,
    comparison: { baseExecutionId: base.id, hypothesisExecutionId: next.id, value: structuredClone(compared.value) as DeepMutable<typeof compared.value> } };
}

export async function refreshSourceFingerprints(input: Awaited<ReturnType<typeof observedInput>>) {
  const scenario = input.study.scenarios[0]!;
  scenario.sourceSnapshot.sourceFingerprint = await fingerprintPortfolioSource(scenario.sourceSnapshot);
  scenario.inputFingerprint = await fingerprintScenarioInput(scenario);
  for (const execution of input.study.executions) {
    if (execution.kind !== 'DIAGNOSTIC') continue;
    execution.sourceSnapshot = structuredClone(scenario.sourceSnapshot);
    execution.inputFingerprint = scenario.inputFingerprint;
    execution.requestSnapshot.input_fingerprint = scenario.inputFingerprint;
    if (execution.envelope !== null) execution.envelope.request_fingerprint = scenario.inputFingerprint;
  }
}
