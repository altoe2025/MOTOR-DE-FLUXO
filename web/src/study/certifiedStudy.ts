import type { StudyDocument, StudyValidation } from './model';
import { validateStudyDocumentWithExecutionYield } from './validation';

// An ephemeral certificate for one immutable identity, never a persisted result cache.
const certifiedOwners = new WeakMap<object, string>();

function freezeFully(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    freezeFully((value as Record<PropertyKey, unknown>)[key], seen);
  }
  Object.freeze(value);
}

/** Clone before the first await, then validate every rule with the explicit owner. */
export function validateAndCertifyStudy(
  value: unknown,
  expectedOwnerSub: string,
): Promise<StudyValidation<StudyDocument>> {
  const snapshot = structuredClone(value);
  return validateStudyDocumentWithExecutionYield(snapshot, expectedOwnerSub).then((result) => {
    if (!result.ok) return result;
    freezeFully(result.value);
    certifiedOwners.set(result.value, expectedOwnerSub);
    return result;
  });
}

export function isCertifiedStudy(value: unknown, expectedOwnerSub: string): value is StudyDocument {
  return value !== null && typeof value === 'object'
    && certifiedOwners.get(value) === expectedOwnerSub;
}
