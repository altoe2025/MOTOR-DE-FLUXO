import { describe, expect, it } from 'vitest';
import type { ObservedCase } from '../cases/domain';
import { checkProfileCompatibility } from './compatibility';

const provenance = { kind: 'OBSERVED', source: 'fixture.xlsx', version: 'layout-1', recordedAt: '2026-09-20T12:00:00Z' } as const;

function aCase(overrides: Partial<ObservedCase> = {}): ObservedCase {
  const id = overrides.id ?? 'case-a';
  return {
    schemaVersion: '2.0.0', id, ownerSub: 'owner-1', companyId: 'company-1', status: 'CONFIRMED', revision: 1,
    window: { startDate: '2026-01-01', endDate: '2026-01-02', closingDate: '2026-01-02' },
    orders: [{ id: `${id}-order`, clientId: 'client-1', direction: 'OUT', knownDate: '2026-01-01', deadlineDate: '2026-01-02', valueBrl: '100', purposeCode: 'SERVICES', efxStatus: 'NOT_COLLECTED', provenance: [provenance] }],
    controlTotals: [{ code: 'GROSS_OUT_BRL', valueBrl: '100', provenance }],
    sourceManifest: { adapterId: 'xlsx-canonical', adapterVersion: '1.0.0', sourceKind: 'XLSX', files: [{ name: `${id}.xlsx`, sizeBytes: 100, sha256: 'a'.repeat(64) }] },
    normalization: { rulesetId: 'canonical-xlsx', rulesetVersion: '1.0.0', normalizedAt: '2026-09-20T12:00:00Z' },
    quality: { blockers: [], warnings: [] }, corrections: [], observedOutcome: null, confirmedAt: '2026-09-20T12:05:00Z', ...overrides,
  };
}

describe('checkProfileCompatibility', () => {
  // Production break caught: an empty selection reaches profile calculation without a blocker.
  it('blocks an empty selection', () => {
    expect(checkProfileCompatibility([]).blockers.map((item) => item.code)).toEqual(['EMPTY_SELECTION']);
  });

  // Production break caught: cases belonging to different owners or companies are combined.
  it('blocks mixed ownership and mixed companies', () => {
    expect(checkProfileCompatibility([aCase(), aCase({ id: 'owner-b', ownerSub: 'owner-2' })]).blockers.map((item) => item.code)).toContain('MULTIPLE_OWNERS');
    expect(checkProfileCompatibility([aCase(), aCase({ id: 'company-b', companyId: 'company-2' })]).blockers.map((item) => item.code)).toContain('MULTIPLE_COMPANIES');
  });

  // Production break caught: the same immutable case revision contributes its orders twice.
  it('blocks a repeated case and revision', () => {
    const selected = aCase();
    expect(checkProfileCompatibility([selected, selected]).blockers.map((item) => item.code)).toContain('DUPLICATE_CASE_REVISION');
  });

  // Production break caught: drafts or malformed confirmed documents enter the profile.
  it('blocks invalid status and invalid documents', () => {
    const draft = { ...aCase(), status: 'DRAFT', confirmedAt: null } as unknown as ObservedCase;
    const malformed = aCase({ id: 'malformed', window: { startDate: '2026-01-01', endDate: '2026-01-02', closingDate: '2026-01-03' } });
    expect(checkProfileCompatibility([draft]).blockers.map((item) => item.code)).toContain('INVALID_STATUS');
    expect(checkProfileCompatibility([malformed]).blockers.map((item) => item.code)).toContain('INVALID_DOCUMENT');
  });

  // Production break caught: two cases backed by the same source bytes are double counted silently.
  it('requires explicit confirmation for a source SHA repeated across cases', () => {
    const first = aCase({ id: 'first' });
    const second = aCase({ id: 'second', window: { startDate: '2026-02-01', endDate: '2026-02-02', closingDate: '2026-02-02' } });
    expect(checkProfileCompatibility([first, second]).blockers.map((item) => item.code)).toContain('DUPLICATE_SOURCE_SHA256');
    expect(checkProfileCompatibility([first, second], { confirmedDistinctSourceSha256: ['a'.repeat(64)] }).blockers.map((item) => item.code)).not.toContain('DUPLICATE_SOURCE_SHA256');
  });

  // Production break caught: overlap, normalization drift, or a gap becomes an unreported assumption.
  it('warns about overlap, normalization versions, and discontinuous coverage', () => {
    const overlap = aCase({ id: 'overlap', revision: 2, window: { startDate: '2026-01-02', endDate: '2026-01-03', closingDate: '2026-01-03' }, normalization: { rulesetId: 'canonical-xlsx', rulesetVersion: '2.0.0', normalizedAt: '2026-09-20T12:00:00Z' }, sourceManifest: { adapterId: 'xlsx-canonical', adapterVersion: '1.0.0', sourceKind: 'XLSX', files: [{ name: 'overlap.xlsx', sizeBytes: 100, sha256: 'b'.repeat(64) }] } });
    const later = aCase({ id: 'later', window: { startDate: '2026-02-01', endDate: '2026-02-02', closingDate: '2026-02-02' }, sourceManifest: { adapterId: 'xlsx-canonical', adapterVersion: '1.0.0', sourceKind: 'XLSX', files: [{ name: 'later.xlsx', sizeBytes: 100, sha256: 'c'.repeat(64) }] } });
    const report = checkProfileCompatibility([later, overlap, aCase()]);
    expect(report.blockers).toEqual([]);
    expect(report.warnings.map((item) => item.code)).toEqual(['OVERLAPPING_WINDOWS', 'MIXED_NORMALIZATION_VERSIONS', 'DISCONTINUOUS_COVERAGE']);
  });
});
