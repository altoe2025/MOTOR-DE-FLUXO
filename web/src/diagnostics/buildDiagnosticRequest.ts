import type { DiagnosticRequest, PreviaRequest } from '../api/client';
import { validateDiagnosticRequest } from '../api/validators';
import type { ScenarioDocument } from '../study/model';

const MAX_SEED = 9223372036854775807n;
type GeneratedSampling = Extract<DiagnosticRequest['sampling'], { kind: 'GENERATED_INPUT' }>;

export type BuildDiagnosticRequestInput = Readonly<{
  requestId: string;
  idempotencyKey: string;
  studyId: string;
  scenario: ScenarioDocument;
  count: 1 | 10 | 30 | 100;
  baseSeed: string;
  previewRequest: PreviaRequest;
}>;

export class DiagnosticRequestBuildError extends Error {
  constructor(
    readonly code: 'GENERATION_RECIPE_UNAVAILABLE' | 'INVALID_DIAGNOSTIC_REQUEST',
    details = '',
  ) {
    super(details === '' ? code : `${code}: ${details}`);
    this.name = 'DiagnosticRequestBuildError';
  }
}

export async function buildDiagnosticRequest(
  input: BuildDiagnosticRequestInput,
): Promise<DiagnosticRequest> {
  const repetitionIds = await Promise.all(Array.from(
    { length: input.count },
    (_, index) => deterministicUuid(`${input.baseSeed}|repetition|${index}`),
  ));
  const common = {
    api_version: '1.0.0' as const,
    request_id: input.requestId,
    idempotency_key: input.idempotencyKey,
    study_id: input.studyId,
    scenario_id: input.scenario.id,
    scenario_revision: input.scenario.revision,
    input_fingerprint: input.scenario.inputFingerprint,
    selected_repetition_id: repetitionIds[0]!,
    provenance: structuredClone(input.previewRequest.proveniencia),
  };
  let request: DiagnosticRequest;
  if (input.count === 1) {
    request = {
      ...common,
      sampling: {
        kind: 'FIXED_INPUT',
        count: 1,
        preview_request: structuredClone(input.previewRequest),
      },
    };
  } else {
    const preparation = input.scenario.sourceSnapshot.generationInputSnapshot;
    if (preparation === undefined) {
      throw new DiagnosticRequestBuildError('GENERATION_RECIPE_UNAVAILABLE');
    }
    const used = new Map(preparation.participants.map((participant) => [
      canonicalUuid(participant.id), new Set<string>(),
    ]));
    const repetitions = await Promise.all(repetitionIds.map(async (repetitionId, index) => {
      const participantSeeds = Object.fromEntries(await Promise.all(
        preparation.participants.map(async (participant) => {
          const participantId = canonicalUuid(participant.id);
          let salt = 0;
          let seed: string;
          do {
            seed = await deterministicSeed(`${input.baseSeed}|${participantId}|${index}|${salt}`);
            salt += 1;
          } while (used.get(participantId)!.has(seed));
          used.get(participantId)!.add(seed);
          return [participantId, seed] as const;
        }),
      ));
      return { repetition_id: repetitionId, participant_seeds: participantSeeds };
    }));
    request = {
      ...common,
      sampling: {
        kind: 'GENERATED_INPUT',
        count: input.count,
        preparation_input: structuredClone(preparation) as GeneratedSampling['preparation_input'],
        repetitions,
      },
    };
  }
  if (!validateDiagnosticRequest(request)) {
    throw new DiagnosticRequestBuildError(
      'INVALID_DIAGNOSTIC_REQUEST',
      JSON.stringify(validateDiagnosticRequest.errors ?? []),
    );
  }
  return request;
}

function canonicalUuid(value: string): string {
  return (value.startsWith('urn:uuid:') ? value.slice('urn:uuid:'.length) : value).toLowerCase();
}

async function digest(value: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function deterministicSeed(value: string): Promise<string> {
  const bytes = await digest(value);
  let seed = 0n;
  for (const byte of bytes.slice(0, 8)) seed = (seed << 8n) | BigInt(byte);
  return (seed & MAX_SEED).toString();
}

async function deterministicUuid(value: string): Promise<string> {
  const bytes = (await digest(value)).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
