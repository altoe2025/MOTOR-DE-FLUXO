import { describe, expect, it } from 'vitest';

import observed from '../../../contracts/fixtures/communication/observed.json';
import synthetic from '../../../contracts/fixtures/communication/synthetic.json';
import unicode from '../../../contracts/fixtures/communication/unicode.json';
import invalidCases from '../../../contracts/fixtures/communication/invalid-cases.json';
import type { CommunicationDocumentV1 } from './domain';
import { fingerprintCommunicationDocument } from './evidence';
import { assertValidCommunicationDocument, validateCommunicationDocument } from './validation';

const fixtures = { observed, synthetic, unicode };

describe('CommunicationDocumentV1 trust boundary', () => {
  it.each(Object.entries(fixtures))('preserves %s decimals, absence and cross-language fingerprint', async (_name, fixture) => {
    const result = await validateCommunicationDocument(fixture);
    expect(result).toEqual({ ok: true, value: fixture });
    expect(fixture.executiveMetrics[0]!.value).toBe('12345678901234567890.0123456789');
    expect(fixture.executiveMetrics[1]!.value).toBeNull();
    expect(await fingerprintCommunicationDocument(fixture as CommunicationDocumentV1)).toBe(fixture.contextFingerprint);
    await expect(assertValidCommunicationDocument(fixture)).resolves.toBeUndefined();
  });

  it.each(invalidCases)('rejects $name independently of fingerprint integrity', async (testCase) => {
    const document = structuredClone(fixtures[testCase.base as keyof typeof fixtures]) as unknown as Record<string, unknown>;
    let parent = document;
    for (const key of testCase.path.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
    parent[testCase.path.at(-1)!] = testCase.value;
    if (testCase.path[0] !== 'contextFingerprint') {
      document.contextFingerprint = await fingerprintCommunicationDocument(document as unknown as CommunicationDocumentV1);
    }
    const result = await validateCommunicationDocument(document);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
    await expect(assertValidCommunicationDocument(document)).rejects.toThrow();
  });

  it('excludes only generatedAt and contextFingerprint from the canonical digest', async () => {
    const document = { ...observed, generatedAt: '2026-09-24T01:02:03Z' } as CommunicationDocumentV1;
    expect(await fingerprintCommunicationDocument(document)).toBe(observed.contextFingerprint);
    expect(await validateCommunicationDocument(document)).toMatchObject({ ok: true });
    expect(await fingerprintCommunicationDocument({ ...document, study: { ...document.study, name: 'Alterado' } })).not.toBe(observed.contextFingerprint);
  });
});
