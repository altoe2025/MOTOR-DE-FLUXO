import type { StudyDocument, StudyValidation } from './model';
import { validateStudyDocumentWithExecutionYield } from './validation';
import { assertDiagnosticAttemptForStudy } from '../diagnostics/domain';
import type { DiagnosticAppendDelta } from '../storage/applicationRepository';

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

function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function isPlainJsonTreeCooperative(value: unknown): Promise<boolean> {
  const active = new WeakSet<object>();
  const stack: Array<Readonly<{ value: unknown; exit: boolean }>> = [{ value, exit: false }];
  let deadline = performance.now() + 8;
  while (stack.length > 0) {
    const frame = stack.pop()!;
    const current = frame.value;
    if (current === null || typeof current === 'string' || typeof current === 'boolean') continue;
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) return false;
      continue;
    }
    if (typeof current !== 'object') return false;
    if (frame.exit) {
      active.delete(current);
      continue;
    }
    if (active.has(current)) return false;
    const array = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
    active.add(current);
    stack.push({ value: current, exit: true });
    const keys = Reflect.ownKeys(current);
    if (array && keys.length !== current.length + 1) return false;
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index]!;
      if (typeof key !== 'string') return false;
      if (array && key === 'length') continue;
      if (array) {
        const itemIndex = Number(key);
        if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= current.length
          || String(itemIndex) !== key) return false;
      }
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) return false;
      stack.push({ value: descriptor.value, exit: false });
    }
    if (performance.now() >= deadline) {
      await nextMacrotask();
      deadline = performance.now() + 8;
    }
  }
  return true;
}

async function freezeFullyCooperative(value: unknown): Promise<void> {
  const seen = new WeakSet<object>();
  const stack: Array<Readonly<{ value: object; exit: boolean }>> = value !== null && typeof value === 'object'
    ? [{ value, exit: false }]
    : [];
  let deadline = performance.now() + 8;
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.exit) {
      Object.freeze(frame.value);
    } else if (!seen.has(frame.value)) {
      seen.add(frame.value);
      stack.push({ value: frame.value, exit: true });
      for (const key of Reflect.ownKeys(frame.value)) {
        const child = (frame.value as Record<PropertyKey, unknown>)[key];
        if (child !== null && typeof child === 'object') stack.push({ value: child, exit: false });
      }
    }
    if (performance.now() >= deadline) {
      await nextMacrotask();
      deadline = performance.now() + 8;
    }
  }
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

/**
 * Certifies a uniquely owned IndexedDB snapshot without cloning it again.
 * The caller must not retain another reference or expose the value before this resolves.
 */
export async function validateAndCertifyDetachedStudy(
  value: unknown,
  expectedOwnerSub: string,
): Promise<StudyValidation<StudyDocument>> {
  if (!validOwnerSub(expectedOwnerSub)) {
    return { ok: false, issues: [{ path: '/ownerSub', code: 'OWNER_MISMATCH',
      message: 'Owner esperado inválido.' }] };
  }
  let plain = false;
  try { plain = await isPlainJsonTreeCooperative(value); } catch { /* Exotic traps cannot be certified. */ }
  if (!plain) return { ok: false, issues: [{ path: '/', code: 'INVALID_STRUCTURE',
    message: 'Documento de estudo contém objeto não JSON.' }] };
  const result = await validateStudyDocumentWithExecutionYield(value, expectedOwnerSub);
  if (!result.ok) return result;
  await freezeFullyCooperative(result.value);
  certifiedOwners.set(result.value, expectedOwnerSub);
  return result;
}

export function isCertifiedStudy(value: unknown, expectedOwnerSub: string): value is StudyDocument {
  return value !== null && typeof value === 'object' && validOwnerSub(expectedOwnerSub)
    && certifiedOwners.has(value)
    && certifiedOwners.get(value) === expectedOwnerSub;
}

/** Preserve the certificate using only a validated append and already-frozen history. */
export function applyCertifiedDiagnosticAppend(
  study: StudyDocument,
  delta: DiagnosticAppendDelta,
): StudyDocument {
  if (!isCertifiedStudy(study, study.ownerSub)) throw new Error('Estudo base não certificado.');
  if (!isPlainJsonTree(delta) || delta.studyId !== study.id
    || delta.revision !== study.revision + 1 || !Number.isSafeInteger(delta.revision)
    || delta.executions.length !== 2 || delta.updatedAt !== delta.executions[1].finishedAt) {
    throw new Error('Delta diagnóstico inválido.');
  }
  const [reservation, terminal] = structuredClone(delta.executions);
  assertDiagnosticAttemptForStudy(study, reservation, terminal);
  if (study.executions.some((item) => item.id === reservation.id || item.id === terminal.id
    || item.attemptId === reservation.attemptId)) throw new Error('Tentativa diagnóstica duplicada.');
  freezeFully(reservation);
  freezeFully(terminal);
  const result: StudyDocument = Object.freeze({ ...study, revision: delta.revision,
    updatedAt: delta.updatedAt, executions: Object.freeze([...study.executions, reservation, terminal]) });
  certifiedOwners.set(result, study.ownerSub);
  return result;
}
