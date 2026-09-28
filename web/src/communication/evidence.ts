import type { CommunicationDocumentV1 } from './domain';

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (character) => character.codePointAt(0)!);
  const b = Array.from(right, (character) => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

/** Unicode code-point key order, matching Python json.dumps(sort_keys=True). */
function canonicalContext(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalContext).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => compareCodePoints(left, right));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalContext(child)}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Valor não serializável para fingerprint.');
  return encoded;
}

export async function fingerprintContextDocument(document: object): Promise<string> {
  const payload = Object.fromEntries(Object.entries(document)
    .filter(([key]) => key !== 'generatedAt' && key !== 'contextFingerprint'));
  const bytes = new TextEncoder().encode(canonicalContext(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function fingerprintCommunicationDocument(
  document: Omit<CommunicationDocumentV1, 'contextFingerprint'> | CommunicationDocumentV1,
): Promise<string> {
  return fingerprintContextDocument(document);
}
