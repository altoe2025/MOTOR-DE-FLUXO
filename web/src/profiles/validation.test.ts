import { describe, expect, it } from 'vitest';
import type { ObservedCase } from '../cases/domain';
import { calculateOperationalProfile } from './calculateOperationalProfile';
import type { OperationalProfileVersion } from './domain';
import { fingerprintOperationalProfile } from './fingerprints';
import { validateOperationalProfile } from './validation';

const provenance = { kind: 'OBSERVED', source: 'fixture.xlsx', version: 'layout-1', recordedAt: '2026-09-20T12:00:00Z' } as const;
const selectedCase: ObservedCase = {
  schemaVersion: '2.0.0', id: 'case-1', ownerSub: 'owner-1', companyId: 'company-1', status: 'CONFIRMED', revision: 1,
  window: { startDate: '2026-01-01', endDate: '2026-01-01', closingDate: '2026-01-01' },
  orders: [{ id: 'order-1', clientId: 'client-1', direction: 'OUT', knownDate: '2026-01-01', deadlineDate: '2026-01-02', valueBrl: '100.00', purposeCode: null, efxStatus: 'NOT_COLLECTED', provenance: [provenance] }],
  controlTotals: [{ code: 'GROSS_OUT_BRL', valueBrl: '100.0', provenance }],
  sourceManifest: { adapterId: 'xlsx-canonical', adapterVersion: '1.0.0', sourceKind: 'XLSX', files: [{ name: 'case.xlsx', sizeBytes: 100, sha256: 'a'.repeat(64) }] },
  normalization: { rulesetId: 'canonical-xlsx', rulesetVersion: '1.0.0', normalizedAt: '2026-09-20T12:00:00Z' },
  quality: { blockers: [], warnings: [] }, corrections: [], observedOutcome: null, confirmedAt: '2026-09-20T12:05:00Z',
};
async function profile() {
  return calculateOperationalProfile({ id: 'profile-1', ownerSub: 'owner-1', companyId: 'company-1', version: 1, createdAt: '2026-09-20T14:00:00Z', cases: [selectedCase] });
}

describe('validateOperationalProfile', () => {
  // Production break caught: a generated schema-valid profile cannot cross the read boundary.
  it('accepts an intact profile and normalized decimal fingerprints', async () => {
    const document = await profile();
    expect(await validateOperationalProfile(document)).toEqual({ ok: true, value: document });
  });

  // Production break caught: changed content remains trusted under a stale document fingerprint.
  it('rejects a stale document fingerprint', async () => {
    const document = await profile();
    const tampered = { ...document, metrics: { ...document.metrics, volume: { ...document.metrics.volume, totalBrl: { ...document.metrics.volume.totalBrl, value: '999' } } } };
    expect(await validateOperationalProfile(tampered)).toMatchObject({ ok: false, issues: [{ code: 'DOCUMENT_FINGERPRINT_MISMATCH', path: '/documentFingerprint' }] });
  });

  // Production break caught: a selection fingerprint can be replaced independently of selected case evidence.
  it('rejects a stale selection fingerprint before accepting the document', async () => {
    const document = await profile();
    expect(await validateOperationalProfile({ ...document, selectionFingerprint: 'f'.repeat(64) })).toMatchObject({ ok: false, issues: [{ code: 'SELECTION_FINGERPRINT_MISMATCH', path: '/selectionFingerprint' }] });
  });

  // Production break caught: malformed unavailable evidence smuggles a numeric value through runtime validation.
  it('rejects a value on NOT_COLLECTED evidence', async () => {
    const tampered = structuredClone(await profile()) as unknown as Record<string, unknown>;
    const metrics = tampered.metrics as { purposes: { missing: Record<string, unknown> } };
    metrics.purposes.missing.value = '0';
    const validation = await validateOperationalProfile(tampered);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.some((item) => item.code === 'INVALID_STRUCTURE')).toBe(true);
    }
  });

  // Production break caught: recomputing the fingerprint lets a document omit a required volume metric.
  it('rejects a profile missing a required metric key even with a fresh fingerprint', async () => {
    const tampered = structuredClone(await profile()) as unknown as {
      metrics: { volume: Record<string, unknown> };
      documentFingerprint: string;
    };
    Reflect.deleteProperty(tampered.metrics.volume, 'totalBrl');
    tampered.documentFingerprint = await fingerprintOperationalProfile(
      tampered as unknown as OperationalProfileVersion,
    );

    const validation = await validateOperationalProfile(tampered);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.some((item) => item.code === 'INVALID_STRUCTURE')).toBe(true);
    }
  });

  // Production break caught: recomputing the fingerprint lets arbitrary objects masquerade as FieldProvenance.
  it('rejects arbitrary provenance fields even with a fresh fingerprint', async () => {
    const tampered = structuredClone(await profile()) as unknown as {
      provenance: { fields: unknown[] };
      documentFingerprint: string;
    };
    tampered.provenance.fields = [{ arbitrary: true }];
    tampered.documentFingerprint = await fingerprintOperationalProfile(
      tampered as unknown as OperationalProfileVersion,
    );

    const validation = await validateOperationalProfile(tampered);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.some((item) => item.code === 'INVALID_STRUCTURE')).toBe(true);
    }
  });
});
