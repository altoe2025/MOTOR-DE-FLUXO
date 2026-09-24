import type { StudyDocument, StudyValidation } from './model';
import { validateStudyDocumentWithExecutionYield } from './validation';

// An ephemeral certificate for one immutable identity, never a persisted result cache.
const certifiedOwners = new WeakMap<object, string>();

function validOwnerSub(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

function isPlainJsonTree(value: unknown, active = new WeakSet<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || active.has(value)) return false;
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
  active.add(value);
  const keys = Reflect.ownKeys(value);
  if (array && keys.length !== value.length + 1) return false;
  for (const key of keys) {
    if (typeof key !== 'string') return false;
    if (array && key === 'length') continue;
    if (array) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key) return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)
      || !isPlainJsonTree(descriptor.value, active)) return false;
  }
  active.delete(value);
  return true;
}

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
  if (!validOwnerSub(expectedOwnerSub)) {
    return Promise.resolve({ ok: false, issues: [{ path: '/ownerSub', code: 'OWNER_MISMATCH',
      message: 'Owner esperado inválido.' }] });
  }
  let plain = false;
  try { plain = isPlainJsonTree(value); } catch { /* Exotic traps cannot be certified. */ }
  const snapshot = structuredClone(value);
  return validateStudyDocumentWithExecutionYield(snapshot, expectedOwnerSub).then((result) => {
    if (!result.ok) return result;
    if (!plain) return { ok: false, issues: [{ path: '/', code: 'INVALID_STRUCTURE',
      message: 'Documento de estudo contém objeto não JSON.' }] };
    freezeFully(result.value);
    certifiedOwners.set(result.value, expectedOwnerSub);
    return result;
  });
}

export function isCertifiedStudy(value: unknown, expectedOwnerSub: string): value is StudyDocument {
  return value !== null && typeof value === 'object' && validOwnerSub(expectedOwnerSub)
    && certifiedOwners.has(value)
    && certifiedOwners.get(value) === expectedOwnerSub;
}
