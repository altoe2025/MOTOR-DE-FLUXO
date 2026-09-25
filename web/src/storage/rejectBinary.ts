import { BinaryDataNotAllowedError } from './errors';

/** Inspect before opening storage, including binary values hidden in containers. */
export function rejectBinary(value: unknown, seen = new Set<object>()): void {
  if ((typeof Blob !== 'undefined' && value instanceof Blob)
    || value instanceof ArrayBuffer || ArrayBuffer.isView(value)
    || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)) {
    throw new BinaryDataNotAllowedError();
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Map) {
    for (const [key, child] of value) { rejectBinary(key, seen); rejectBinary(child, seen); }
  } else if (value instanceof Set) {
    for (const child of value) rejectBinary(child, seen);
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) rejectBinary(descriptor.value, seen);
  }
}
