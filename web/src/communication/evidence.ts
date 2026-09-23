import type { CommunicationDocumentV1 } from './domain';
import { canonical } from '../study/fingerprints';

export async function fingerprintCommunicationDocument(
  document: Omit<CommunicationDocumentV1, 'contextFingerprint'> | CommunicationDocumentV1,
): Promise<string> {
  // generatedAt is metadata; all other content participates in context identity.
  const payload = Object.fromEntries(Object.entries(document)
    .filter(([key]) => key !== 'generatedAt' && key !== 'contextFingerprint'));
  const bytes = new TextEncoder().encode(canonical(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
