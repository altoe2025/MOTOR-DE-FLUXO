import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  validateDiagnosticEnvelope,
  validateDiagnosticRequest,
  validateJobSnapshot,
  validatePreparationRequest,
  validatePreparationResponse,
  validatePreviaRequest,
} from './validators';

const fixturePath = fileURLToPath(
  new URL('../../../contracts/fixtures/reference-request.json', import.meta.url),
);

const source = {
  kind: 'PADRAO_SINTETICO',
  source: 'Fixture validators MOT-25',
  recorded_at: '2026-09-19T00:00:00Z',
};

function preparationRequest() {
  const paths = [
    '/warmup_days',
    '/measurement_days',
    '/window_days',
    '/costs/iof_out',
    '/costs/iof_in',
    '/costs/carry_cnr',
    '/costs/spread_rail_bps',
    '/costs/custo_fixo_remessa',
    '/costs/custo_oportunidade_aa',
    '/costs/ptax',
  ];
  return {
    preparation_version: '1.0.0',
    request_id: '00000000-0000-4000-8000-000000000010',
    study_id: '00000000-0000-4000-8000-000000000011',
    scenario_id: '00000000-0000-4000-8000-000000000012',
    scenario_revision: 1,
    expected_build_sha: 'a'.repeat(40),
    input: {
      participants: [],
      warmup_days: 0,
      measurement_days: 30,
      window_days: 7,
      costs: {
        iof_out: '0.035',
        iof_in: '0.0038',
        carry_cnr: '0.0004',
        spread_rail_bps: '0',
        custo_fixo_remessa: '0',
        custo_oportunidade_aa: '0',
        ptax: '5.40',
        iof_por_finalidade: [],
      },
      sources: Object.fromEntries(paths.map((path) => [path, source])),
    },
  };
}

function preparationResponse() {
  const request = preparationRequest();
  return {
    preparation_version: '1.0.0',
    preparation_id: '00000000-0000-4000-8000-000000000014',
    request_id: request.request_id,
    study_id: request.study_id,
    scenario_id: request.scenario_id,
    scenario_revision: request.scenario_revision,
    created_at: '2026-09-19T00:00:00Z',
    motor_build_sha: 'a'.repeat(40),
    generator_version: 'dimensionamento-v1',
    generation_fingerprint: 'b'.repeat(64),
    input_snapshot: request.input,
    orders: [],
    parameters: [],
    composition: [
      {
        participant_id: null,
        order_count: 0,
        out_brl: '0',
        in_brl: '0',
        total_brl: '0',
        out_fraction: null,
      },
    ],
    derived_provenance: {},
  };
}

function diagnosticRequest() {
  const previewRequest = JSON.parse(readFileSync(fixturePath, 'utf8'));
  return {
    api_version: '1.0.0',
    request_id: '00000000-0000-4000-8000-000000000020',
    idempotency_key: '00000000-0000-4000-8000-000000000021',
    study_id: previewRequest.study_id,
    scenario_id: previewRequest.scenario_id,
    scenario_revision: previewRequest.scenario_revision,
    input_fingerprint: 'a'.repeat(64),
    sampling: {
      kind: 'FIXED_INPUT',
      count: 1,
      preview_request: previewRequest,
    },
    selected_repetition_id: '00000000-0000-4000-8000-000000000022',
    provenance: {},
  };
}

function generatedDiagnosticRequest() {
  const request = diagnosticRequest();
  const repetitions = Array.from({ length: 10 }, (_, index) => ({
    repetition_id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
    participant_seeds: {},
  }));
  return {
    ...request,
    sampling: {
      kind: 'GENERATED_INPUT',
      count: 10,
      preparation_input: preparationRequest().input,
      repetitions,
    },
    selected_repetition_id: repetitions[0]?.repetition_id,
  };
}

function jobSnapshot() {
  return {
    api_version: '1.0.0',
    job_id: '00000000-0000-4000-8000-000000000023',
    request_id: '00000000-0000-4000-8000-000000000020',
    status: 'RUNNING',
    progress: {
      completed: 3,
      failed: 0,
      total: 10,
      current_repetition_id: '00000000-0000-4000-8000-000000000024',
      phase: 'EXECUTING',
      created_at: '2026-09-20T12:00:00Z',
      started_at: '2026-09-20T12:00:01Z',
      updated_at: '2026-09-20T12:00:02Z',
      finished_at: null,
    },
    retry_of_job_id: null,
    error: null,
  };
}

describe('generated runtime validation', () => {
  it('accepts the versioned reference request', () => {
    const payload: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));
    expect(validatePreviaRequest(payload)).toBe(true);
  });

  it('rejects a JSON number where decimal text is required', () => {
    const payload = JSON.parse(readFileSync(fixturePath, 'utf8'));
    payload.cenario.ordens[0].valor_brl = 10800000;
    expect(validatePreviaRequest(payload)).toBe(false);
  });

  it('accepts a strict preparation request and its canonical response', () => {
    expect(validatePreparationRequest(preparationRequest())).toBe(true);
    expect(validatePreparationResponse(preparationResponse())).toBe(true);
  });

  it('rejects extra preparation request fields and malformed response composition', () => {
    const request = { ...preparationRequest(), injected: true };
    const response: { composition: unknown } = preparationResponse();
    response.composition = [{ participant_id: null }];

    expect(validatePreparationRequest(request)).toBe(false);
    expect(validatePreparationResponse(response)).toBe(false);
  });

  it('validates the strict fixed-input diagnostic request', () => {
    expect(validateDiagnosticRequest(diagnosticRequest())).toBe(true);
    expect(validateDiagnosticRequest({ ...diagnosticRequest(), raw_filename: 'orders.csv' })).toBe(false);

    const wrongCount = diagnosticRequest();
    wrongCount.sampling.count = 2;
    expect(validateDiagnosticRequest(wrongCount)).toBe(false);
  });

  it('rejects a generated request when count differs from explicit repetitions', () => {
    const request = generatedDiagnosticRequest();
    expect(validateDiagnosticRequest(request)).toBe(true);
    request.sampling.repetitions.push({
      repetition_id: '00000000-0000-4000-8000-000000000110',
      participant_seeds: {},
    });

    expect(validateDiagnosticRequest(request)).toBe(false);
  });

  it('rejects invalid participant seed keys and seeds above the canonical maximum', () => {
    const invalidKey = generatedDiagnosticRequest();
    invalidKey.sampling.repetitions[0]!.participant_seeds = { 'not-a-uuid': '1' };
    expect(validateDiagnosticRequest(invalidKey)).toBe(false);

    const oversizedSeed = generatedDiagnosticRequest();
    oversizedSeed.sampling.repetitions[0]!.participant_seeds = {
      '00000000-0000-4000-8000-000000000200': '9223372036854775808',
    };
    expect(validateDiagnosticRequest(oversizedSeed)).toBe(false);
  });

  it('validates job progress and exposes the diagnostic envelope validator', () => {
    expect(validateJobSnapshot(jobSnapshot())).toBe(true);

    const impossible = jobSnapshot();
    impossible.progress.completed = 101;
    expect(validateJobSnapshot(impossible)).toBe(false);
    expect(validateDiagnosticEnvelope({ file_payload: 'not-an-envelope' })).toBe(false);
  });
});
