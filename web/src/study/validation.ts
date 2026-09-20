import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import httpSchemas from '../api/schemas.json';
import observedCaseSchema from '../cases/observedCase.schema.json';
import operationalProfileSchema from '../profiles/operationalProfile.schema.json';
import { validateOperationalProfile } from '../profiles/validation';
import { validateDiagnosticEnvelope, validateDiagnosticRequest } from '../api/validators';
import {
  canonical,
  canonicalInputSnapshot,
  fingerprintPortfolioSource,
  fingerprintScenarioInput,
} from './fingerprints';
import { migrateStudyDocumentV2 } from './model';
import type {
  ExecutionRecord,
  ExecutionRecordV3,
  DiagnosticExecutionRecord,
  PreviewExecutionRecord,
  StudyDocument,
  StudyDocumentV2,
  StudyDocumentV3,
  StudyValidation,
  StudyValidationIssue,
} from './model';
import studySchema from './study.schema.json';

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(httpSchemas);
ajv.addSchema(observedCaseSchema);
ajv.addSchema(operationalProfileSchema);
const validateStudyV2Schema: ValidateFunction<StudyDocumentV2> = ajv.compile(studySchema);
const validateExecutionSchema: ValidateFunction<ExecutionRecord> = ajv.compile({
  $ref: `${studySchema.$id}#/$defs/ExecutionRecord`,
});
const validatePreviewExecutionSchema = ajv.compile({
  $ref: `${studySchema.$id}#/$defs/PreviewExecutionRecord`,
});
const validateDiagnosticExecutionSchema = ajv.compile({
  $ref: `${studySchema.$id}#/$defs/DiagnosticExecutionRecord`,
});
const validateStudyV3Schema: ValidateFunction<StudyDocumentV3> = ajv.compile({
  $ref: `${studySchema.$id}#/$defs/StudyDocumentV3`,
});

function structuralIssue(error: ErrorObject): StudyValidationIssue {
  return {
    path: error.instancePath === '' ? '/' : error.instancePath,
    code: 'INVALID_STRUCTURE',
    message: 'Documento de estudo inválido.',
  };
}

function issue(
  path: string,
  code: StudyValidationIssue['code'],
  message: string,
): StudyValidationIssue {
  return { path, code, message };
}

function envelopeIsCompatible(
  execution: ExecutionRecord | PreviewExecutionRecord,
  study: Pick<StudyDocument, 'id'>,
): boolean {
  const request = execution.requestSnapshot;
  if (request.study_id !== study.id
    || request.scenario_id !== execution.scenarioId
    || request.scenario_revision !== execution.scenarioRevision) return false;
  if (execution.status !== 'SUCCEEDED') return execution.envelope === null;
  const envelope = execution.envelope;
  if (envelope === null) return false;
  return envelope.execution_id === execution.id
    && envelope.study_id === study.id
    && envelope.request_id === request.request_id
    && envelope.scenario_id === execution.scenarioId
    && envelope.scenario_revision === execution.scenarioRevision
    && envelope.motor_build_sha === execution.engineVersion
    && envelope.api_version === execution.contractVersion
    && canonicalInputSnapshot(envelope.input_snapshot) === canonicalInputSnapshot({
      cenario: request.cenario,
      periodo: request.periodo,
      proveniencia: request.proveniencia,
    });
}

function diagnosticEnvelopeIsCompatible(
  execution: DiagnosticExecutionRecord,
  study: Pick<StudyDocument, 'id'>,
): boolean {
  const request = execution.requestSnapshot;
  if (!validateDiagnosticRequest(request)
    || request.study_id !== study.id
    || request.scenario_id !== execution.scenarioId
    || request.scenario_revision !== execution.scenarioRevision
    || request.input_fingerprint !== execution.inputFingerprint
    || execution.jobId !== request.idempotency_key) return false;
  if (execution.status !== 'SUCCEEDED') return execution.envelope === null;
  const envelope = execution.envelope;
  return envelope !== null
    && validateDiagnosticEnvelope(envelope)
    && envelope.job_id === execution.jobId
    && envelope.request_fingerprint === request.input_fingerprint
    && envelope.selected_execution.study_id === request.study_id
    && envelope.selected_execution.scenario_id === request.scenario_id
    && envelope.selected_execution.scenario_revision === request.scenario_revision;
}

function isTerminal(execution: ExecutionRecordV3): boolean {
  return execution.kind === 'DIAGNOSTIC'
    ? !['QUEUED', 'RUNNING'].includes(execution.status)
    : execution.status !== 'PREPARING' && execution.status !== 'RUNNING';
}

export function parseStudyV3(value: unknown): StudyDocumentV3 {
  let candidate: unknown = value;
  if (value !== null && typeof value === 'object' && 'schemaVersion' in value
    && value.schemaVersion === '2.0.0') {
    if (!validateStudyV2Schema(value)) throw new Error('Documento de estudo V3 inválido.');
    candidate = migrateStudyDocumentV2(value);
  }
  if (!validateStudyV3Schema(candidate)) throw new Error('Documento de estudo V3 inválido.');

  const terminalRequests = new Set<string>();
  const terminalAttempts = new Set<string>();
  for (const execution of candidate.executions) {
    const compatible = execution.kind === 'DIAGNOSTIC'
      ? diagnosticEnvelopeIsCompatible(execution, candidate)
      : envelopeIsCompatible(execution, candidate);
    if (!compatible) {
      throw new Error('Envelope incompatível com a execução.');
    }
    if (!isTerminal(execution)) continue;
    const requestId = execution.requestSnapshot.request_id;
    const duplicateRequest = execution.kind === 'PREVIEW' && terminalRequests.has(requestId);
    const duplicateAttempt = execution.attemptId !== undefined
      && terminalAttempts.has(execution.attemptId);
    if (duplicateRequest || duplicateAttempt) {
      throw new Error('Tentativa possui mais de um terminal persistido.');
    }
    if (execution.kind === 'PREVIEW') terminalRequests.add(requestId);
    if (execution.attemptId !== undefined) terminalAttempts.add(execution.attemptId);
  }
  return structuredClone(candidate);
}

function executionSnapshotIsCompatible(execution: ExecutionRecord): boolean {
  const { sourceSnapshot, premisesSnapshot, periodSnapshot } = execution;
  if (sourceSnapshot === undefined && premisesSnapshot === undefined && periodSnapshot === undefined) {
    return true;
  }
  if (sourceSnapshot === undefined || premisesSnapshot === undefined || periodSnapshot === undefined) {
    return false;
  }
  const ordered = (orders: typeof sourceSnapshot.orders) => [...orders]
    .map((order) => structuredClone(order))
    .sort((left, right) => left.id.localeCompare(right.id));
  const horizon = 'executableHorizonDays' in periodSnapshot
    ? periodSnapshot.executableHorizonDays
    : periodSnapshot.httpPeriod.dias_aquecimento + periodSnapshot.httpPeriod.periodo_medicao_dias;
  return canonical(ordered(sourceSnapshot.orders)) === canonical(ordered(execution.requestSnapshot.cenario.ordens))
    && canonical(premisesSnapshot.costs) === canonical(execution.requestSnapshot.cenario.custo)
    && premisesSnapshot.windowDays === execution.requestSnapshot.cenario.janela_dias
    && canonical(periodSnapshot.httpPeriod) === canonical(execution.requestSnapshot.periodo)
    && horizon === execution.requestSnapshot.cenario.horizonte_dias;
}

function diagnosticSnapshotIsCompatible(execution: DiagnosticExecutionRecord): boolean {
  const request = execution.requestSnapshot;
  if (request.input_fingerprint !== execution.inputFingerprint) return false;
  if (request.sampling.kind === 'FIXED_INPUT') {
    const preview = request.sampling.preview_request;
    return canonical(preview.cenario.ordens) === canonical(execution.sourceSnapshot.orders)
      && canonical(preview.cenario.custo) === canonical(execution.premisesSnapshot.costs)
      && preview.cenario.janela_dias === execution.premisesSnapshot.windowDays
      && canonical(preview.periodo) === canonical(execution.periodSnapshot.httpPeriod);
  }
  return execution.sourceSnapshot.generationInputSnapshot !== undefined
    && canonical(request.sampling.preparation_input)
      === canonical(execution.sourceSnapshot.generationInputSnapshot);
}

export function validateExecutionRecord(
  value: unknown,
  study: StudyDocument,
): StudyValidation<ExecutionRecordV3 | ExecutionRecord> {
  const kind = value !== null && typeof value === 'object' && 'kind' in value
    ? (value as { kind?: unknown }).kind
    : undefined;
  const validator = kind === 'DIAGNOSTIC'
    ? validateDiagnosticExecutionSchema
    : kind === 'PREVIEW'
      ? validatePreviewExecutionSchema
      : validateExecutionSchema;
  if (!validator(value)) {
    return { ok: false, issues: (validator.errors ?? []).map(structuralIssue) };
  }
  const execution = value as ExecutionRecordV3 | ExecutionRecord;
  const envelopeCompatible = kind === 'DIAGNOSTIC'
    ? diagnosticEnvelopeIsCompatible(execution as DiagnosticExecutionRecord, study)
    : envelopeIsCompatible(execution as ExecutionRecord, study);
  if (!envelopeCompatible) {
    return {
      ok: false,
      issues: [issue('/envelope', 'INCOMPATIBLE_ENVELOPE', 'Envelope incompatível com a execução.')],
    };
  }
  const snapshotCompatible = kind === 'DIAGNOSTIC'
    ? diagnosticSnapshotIsCompatible(execution as DiagnosticExecutionRecord)
    : executionSnapshotIsCompatible(execution as ExecutionRecord);
  if (!snapshotCompatible) {
    return {
      ok: false,
      issues: [issue(
        '/sourceSnapshot',
        'INCOMPATIBLE_EXECUTION_SNAPSHOT',
        'Snapshot analítico incompatível com o request histórico.',
      )],
    };
  }
  return { ok: true, value: execution };
}

export async function validateStudyDocument(
  value: unknown,
  expectedOwnerSub?: string,
): Promise<StudyValidation<StudyDocument>> {
  if (!validateStudyV3Schema(value)) {
    return { ok: false, issues: (validateStudyV3Schema.errors ?? []).map(structuralIssue) };
  }
  const issues: StudyValidationIssue[] = [];
  if (expectedOwnerSub !== undefined && value.ownerSub !== expectedOwnerSub) {
    issues.push(issue('/ownerSub', 'OWNER_MISMATCH', 'Owner do documento diverge da conta ativa.'));
  }
  const scenarioIds = value.scenarios.map((scenario) => scenario.id);
  if (new Set(scenarioIds).size !== scenarioIds.length) {
    issues.push(issue('/scenarios', 'DUPLICATE_ID', 'Identificador de cenário repetido.'));
  }
  if (!scenarioIds.includes(value.baseScenarioId)) {
    issues.push(issue('/baseScenarioId', 'BASE_SCENARIO_MISSING', 'Cenário base ausente.'));
  }
  const evidenceIds = new Map<string, string>();
  for (const [index, evidence] of value.evidenceSnapshots.entries()) {
    const profileValidation = await validateOperationalProfile(evidence.profile);
    if (!profileValidation.ok) {
      issues.push(issue(
        `/evidenceSnapshots/${index}/profile`,
        'INVALID_STRUCTURE',
        'Perfil Operacional preservado é inválido.',
      ));
    }
    if (evidence.profile.ownerSub !== value.ownerSub) {
      issues.push(issue(
        `/evidenceSnapshots/${index}/profile/ownerSub`,
        'OWNER_MISMATCH',
        'Owner do Perfil Operacional diverge do estudo.',
      ));
    }
    const previousFingerprint = evidenceIds.get(evidence.profile.id);
    if (previousFingerprint !== undefined
      && previousFingerprint !== evidence.profile.documentFingerprint) {
      issues.push(issue(
        `/evidenceSnapshots/${index}/profile/id`,
        'DUPLICATE_ID',
        'Identificador de Perfil Operacional possui evidências divergentes.',
      ));
    }
    evidenceIds.set(evidence.profile.id, evidence.profile.documentFingerprint);
  }
  for (const [index, scenario] of value.scenarios.entries()) {
    if (scenario.sourceSnapshot.source.kind === 'SYNTHETIC') {
      for (const [seedIndex, seed] of scenario.sourceSnapshot.source.recipe.seeds.entries()) {
        if (BigInt(seed) > 9223372036854775807n) {
          issues.push(issue(
            `/scenarios/${index}/sourceSnapshot/source/recipe/seeds/${seedIndex}`,
            'INVALID_STRUCTURE',
            'Seed sintética fora do intervalo int64.',
          ));
        }
      }
    }
    const expectedSourceFingerprint = await fingerprintPortfolioSource(scenario.sourceSnapshot);
    if (scenario.sourceSnapshot.sourceFingerprint !== expectedSourceFingerprint) {
      issues.push(issue(
        `/scenarios/${index}/sourceSnapshot/sourceFingerprint`,
        'SOURCE_FINGERPRINT_MISMATCH',
        'Fingerprint da origem diverge do snapshot.',
      ));
    }
    const expectedInputFingerprint = await fingerprintScenarioInput(scenario);
    if (scenario.inputFingerprint !== expectedInputFingerprint) {
      issues.push(issue(
        `/scenarios/${index}/inputFingerprint`,
        'INPUT_FINGERPRINT_MISMATCH',
        'Fingerprint global diverge do cenário.',
      ));
    }
  }
  const executionIds = value.executions.map((execution) => execution.id);
  if (new Set(executionIds).size !== executionIds.length) {
    issues.push(issue('/executions', 'DUPLICATE_ID', 'Identificador de execução repetido.'));
  }
  const terminalRequests = new Set<string>();
  const terminalAttempts = new Set<string>();
  for (const execution of value.executions) {
    if (!isTerminal(execution)) continue;
    const requestId = execution.requestSnapshot.request_id;
    const duplicateRequest = execution.kind === 'PREVIEW' && terminalRequests.has(requestId);
    const duplicateAttempt = execution.attemptId !== undefined
      && terminalAttempts.has(execution.attemptId);
    if (duplicateRequest || duplicateAttempt) {
      issues.push(issue(
        '/executions',
        'DUPLICATE_EXECUTION_TERMINAL',
        'Tentativa possui mais de um terminal persistido.',
      ));
      break;
    }
    if (execution.kind === 'PREVIEW') terminalRequests.add(requestId);
    if (execution.attemptId !== undefined) terminalAttempts.add(execution.attemptId);
  }
  for (const [index, execution] of value.executions.entries()) {
    const scenario = value.scenarios.find((candidate) => candidate.id === execution.scenarioId);
    if (scenario === undefined || execution.scenarioRevision > scenario.revision) {
      issues.push(issue(
        `/executions/${index}/scenarioRevision`,
        'MISSING_SCENARIO_REVISION',
        'Execução ligada a revisão de cenário inexistente.',
      ));
      continue;
    }
    const executionValidation = validateExecutionRecord(execution, value);
    if (!executionValidation.ok) issues.push(...executionValidation.issues);
  }
  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}

export async function assertValidStudy(
  study: StudyDocument,
  expectedOwnerSub = study.ownerSub,
): Promise<void> {
  const validation = await validateStudyDocument(study, expectedOwnerSub);
  if (!validation.ok) {
    throw new Error(`Documento de estudo inválido: ${validation.issues.map((item) => item.code).join(', ')}`);
  }
}
