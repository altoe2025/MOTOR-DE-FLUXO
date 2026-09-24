import type { ValidateFunction } from 'ajv';
import { validateDiagnosticRequestShape } from '../generated/validators/api.js';
export {
  validatePreviaRequest,
  validatePreviewEnvelope,
  validateReferenceExample,
  validatePreparationRequest,
  validatePreparationResponse,
  validateJobSnapshot,
  validateDiagnosticEnvelope,
  validateReplayRequest,
  validateReplayDocument,
  validateCatalogoImportacao,
  validateProductHelpCatalogV1,
  validateChatRequestV1,
  validateChatResponseV1,
} from '../generated/validators/api.js';

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const UUID_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEED_TEXT = /^(0|[1-9][0-9]*)$/;
const MAX_SEED = 9223372036854775807n;

function normalizeUuidIdentity(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const bare = value.startsWith('urn:uuid:') ? value.slice('urn:uuid:'.length) : value;
  return UUID_KEY.test(bare) ? bare.toLowerCase() : null;
}

function hasValidGeneratedSampling(data: unknown): boolean {
  if (!isJsonObject(data) || !isJsonObject(data.sampling)) return false;
  const sampling = data.sampling;
  if (sampling.kind !== 'GENERATED_INPUT') return true;
  if (!isJsonObject(sampling.preparation_input)) return false;
  if (!Array.isArray(sampling.preparation_input.participants)) return false;
  if (!Array.isArray(sampling.repetitions)) return false;
  if (sampling.count !== sampling.repetitions.length) return false;
  const participantIds = sampling.preparation_input.participants.map((participant) =>
    isJsonObject(participant) ? normalizeUuidIdentity(participant.id) : null,
  );
  if (participantIds.some((participantId) => participantId === null)) return false;
  const expectedParticipants = new Set(participantIds as string[]);
  if (expectedParticipants.size !== participantIds.length) return false;
  const repetitionIds = new Set<string>();
  const seedsByParticipant = new Map(
    [...expectedParticipants].map((participantId) => [participantId, new Set<string>()]),
  );
  for (const repetition of sampling.repetitions) {
    if (!isJsonObject(repetition) || !isJsonObject(repetition.participant_seeds)) {
      return false;
    }
    const repetitionId = normalizeUuidIdentity(repetition.repetition_id);
    if (repetitionId === null || repetitionIds.has(repetitionId)) return false;
    repetitionIds.add(repetitionId);
    const suppliedParticipants = Object.keys(repetition.participant_seeds);
    if (
      suppliedParticipants.length !== expectedParticipants.size
      || suppliedParticipants.some((participantId) => !expectedParticipants.has(participantId))
    ) {
      return false;
    }
    for (const [participantId, seed] of Object.entries(repetition.participant_seeds)) {
      if (!UUID_KEY.test(participantId) || typeof seed !== 'string' || !SEED_TEXT.test(seed)) {
        return false;
      }
      if (BigInt(seed) > MAX_SEED) return false;
      const usedSeeds = seedsByParticipant.get(participantId);
      if (usedSeeds === undefined || usedSeeds.has(seed)) return false;
      usedSeeds.add(seed);
    }
  }
  const selectedRepetitionId = normalizeUuidIdentity(data.selected_repetition_id);
  return selectedRepetitionId !== null && repetitionIds.has(selectedRepetitionId);
}

// Preserve the custom allOf keyword's behavior and Ajv-compatible errors.
export const validateDiagnosticRequest: ValidateFunction = Object.assign(
  (data: unknown): boolean => {
    if (!validateDiagnosticRequestShape(data)) {
      validateDiagnosticRequest.errors = validateDiagnosticRequestShape.errors ?? null;
      return false;
    }
    if (!hasValidGeneratedSampling(data)) {
      validateDiagnosticRequest.errors = [{
        instancePath: '', schemaPath: '#/allOf/1/validGeneratedSampling',
        keyword: 'validGeneratedSampling', params: {},
        message: 'must pass "validGeneratedSampling" keyword validation',
      }];
      return false;
    }
    validateDiagnosticRequest.errors = null;
    return true;
  },
  { errors: null },
) as ValidateFunction;
