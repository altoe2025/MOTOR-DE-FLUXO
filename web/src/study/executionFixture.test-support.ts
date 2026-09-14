import { readFileSync } from 'node:fs';
import { validatePreviaRequest, validatePreviewEnvelope } from '../api/validators';
import { makeStudy } from './fixtures';
import type { ExecutionRecord, StudyDocument, PreviaRequest, PreviewEnvelope } from './model';

export function makeExecution(study: StudyDocument = makeStudy()): ExecutionRecord {
  const requestValue: unknown = JSON.parse(readFileSync(new URL('../../../contracts/fixtures/reference-request.json', import.meta.url), 'utf8'));
  const envelopeValue: unknown = JSON.parse(readFileSync(new URL('../../../contracts/fixtures/reference-result.json', import.meta.url), 'utf8'));
  if (!validatePreviaRequest(requestValue) || !validatePreviewEnvelope(envelopeValue)) throw new Error('Fixture HTTP inválida');
  const request = requestValue as PreviaRequest;
  const envelope = envelopeValue as PreviewEnvelope;
  for (const target of [request, envelope]) {
    target.study_id = study.id;
    target.scenario_id = study.scenario_id;
    target.scenario_revision = study.attempt?.scenario_revision ?? study.scenario_revision;
    target.request_id = study.attempt?.request_id ?? request.request_id;
  }
  envelope.motor_build_sha = 'a'.repeat(40);
  envelope.execution_id = '00000000-0000-4000-8000-000000000301';
  return {
    record_version: '1.0.0', id: envelope.execution_id, study_id: study.id,
    scope: structuredClone(study.scope), received_at: '2026-09-13T00:00:00Z',
    preparation_id: null, authored_snapshot: null, preparation_snapshot: null,
    request_snapshot: request, numeric_key: 'a'.repeat(64), evidence_key: 'b'.repeat(64), envelope,
  };
}
