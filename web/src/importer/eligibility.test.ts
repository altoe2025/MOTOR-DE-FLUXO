import { describe, expect, it } from 'vitest';

import type { CompanyRecord } from '../cases/domain';
import type { ParsedImport } from './xlsxParser';
import { applyImportCommand, createImportReview } from './eligibility';

const company: CompanyRecord = {
  id: 'company-1', ownerSub: 'owner-1', displayName: 'Empresa Exemplo', aliases: [],
  createdAt: '2026-09-23T12:00:00.000Z', updatedAt: '2026-09-23T12:00:00.000Z', revision: 1,
};

function parsed(rows: ParsedImport['rows']): ParsedImport {
  return {
    layout: 'xlsx-operacoes/1.0.0', byteSize: 123, sha256: 'a'.repeat(64), rows,
  };
}

const row = {
  operacao_id: 'OP-1', cliente_nome: 'Órbita Comércio', classificacao_perfil: null,
  direcao: 'OUT', data_conhecida: '2026-10-17', data_limite: '2026-10-19',
  valor_brl: '100,50', finalidade_codigo: null,
} as const;

describe('createImportReview', () => {
  it('projects valid canonical rows into an auditable ObservedCase draft', () => {
    const review = createImportReview({ parsed: parsed([row]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z', positionIdentified: true });

    expect(review.draft).toMatchObject({
      status: 'DRAFT', ownerSub: 'owner-1', companyId: 'company-1',
      orders: [{
        id: 'OP-1', direction: 'OUT', knownDate: '2026-10-17', deadlineDate: '2026-10-19',
        valueBrl: '100.5', purposeCode: null, efxStatus: 'NOT_COLLECTED',
        fieldProvenance: { purposeCode: { kind: 'NOT_COLLECTED' }, efxStatus: { kind: 'NOT_COLLECTED' } },
      }],
      controlTotals: [{ code: 'GROSS_OUT_BRL', valueBrl: '100.5' }, { code: 'GROSS_IN_BRL', valueBrl: '0' }],
    });
    expect(review.blockers).toEqual([]);
    expect(review.warnings.map((warning) => warning.code)).toEqual([
      'PURPOSE_MISSING', 'EFX_NOT_COLLECTED',
    ]);
  });

  it('keeps an unresolved divergent duplicate and an unidentified position as blockers', () => {
    const review = createImportReview({
      parsed: parsed([row, { ...row, valor_brl: '200' }]), company, ownerSub: 'owner-1',
      now: '2026-09-23T12:00:00.000Z', positionIdentified: false,
    });

    expect(review.blockers.map((blocker) => blocker.code)).toEqual(expect.arrayContaining([
      'DUPLICATE_UNRESOLVED', 'POSITION_UNIDENTIFIED',
    ]));
  });

  it('separates absent company, invalid source fields and divergent control totals as blockers', () => {
    const review = createImportReview({
      parsed: parsed([{ ...row, direcao: 'UNKNOWN', data_conhecida: 'not-a-date', valor_brl: '0' }]),
      company: null,
      ownerSub: 'owner-1',
      now: '2026-09-23T12:00:00.000Z',
      controlTotals: { out: '99', in: '0' },
    });

    expect(review.blockers.map((blocker) => blocker.code)).toEqual(expect.arrayContaining([
      'COMPANY_MISSING', 'DIRECTION_UNKNOWN', 'INVALID_DATE', 'VALUE_NOT_POSITIVE', 'TOTAL_DIVERGENT',
    ]));
  });
});

describe('applyImportCommand', () => {
  it('records a correction, can exclude and restore it, and reverts the batch deterministically', () => {
    const original = createImportReview({ parsed: parsed([row]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z' });
    const corrected = applyImportCommand(original, {
      kind: 'CORRECT_FIELD', versionId: original.batches[0]!.rows[0]!.versionId, operationId: 'OP-1', field: 'valueBrl', rawValue: '125,75', actionId: 'correction-1', at: '2026-09-23T12:01:00.000Z',
    });
    const excluded = applyImportCommand(corrected, {
      kind: 'EXCLUDE_OPERATION', operationId: 'OP-1', eventId: 'exclude-1', at: '2026-09-23T12:02:00.000Z',
    });
    const restored = applyImportCommand(excluded, {
      kind: 'RESTORE_OPERATION', operationId: 'OP-1', eventId: 'restore-1', at: '2026-09-23T12:03:00.000Z',
    });
    const reverted = applyImportCommand(restored, {
      kind: 'REVERT_BATCH', batchId: original.batches[0]!.id, eventId: 'revert-1', at: '2026-09-23T12:04:00.000Z',
    });

    expect(corrected.draft.orders[0]).toMatchObject({ valueBrl: '125.75' });
    expect(corrected.draft.corrections).toContainEqual(expect.objectContaining({
      id: 'correction-1', originalValue: '100.5', nextValue: '125.75',
    }));
    expect(excluded.draft.orders).toEqual([]);
    expect(restored.draft.orders[0]).toMatchObject({ id: 'OP-1' });
    expect(reverted.draft.orders).toEqual([]);
  });

  it('changes a client identity only through an explicit alias command', () => {
    const original = createImportReview({
      parsed: parsed([row, { ...row, operacao_id: 'OP-2', cliente_nome: 'Órbita Comercial' }]),
      company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z',
    });
    const target = original.draft.orders.find((order) => order.id === 'OP-1')!;
    const before = original.draft.orders.find((order) => order.id === 'OP-2')!;

    const associated = applyImportCommand(original, {
      kind: 'ASSOCIATE_ALIAS', alias: 'Órbita Comercial', canonicalClientId: target.clientId,
      eventId: 'alias-1', at: '2026-09-23T12:01:00.000Z',
    });

    expect(before.clientId).not.toBe(target.clientId);
    expect(associated.draft.orders.find((order) => order.id === 'OP-2')?.clientId).toBe(target.clientId);
  });

  it('repairs an invalid row from its retained review-only source cell', () => {
    const review = createImportReview({
      parsed: parsed([{ ...row, direcao: 'UNKNOWN' }]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z',
    });

    const corrected = applyImportCommand(review, {
      kind: 'CORRECT_FIELD', versionId: review.batches[0]!.rows[0]!.versionId, operationId: 'OP-1', field: 'direction', rawValue: 'IN', actionId: 'correction-direction', at: '2026-09-23T12:01:00.000Z',
    });

    expect(corrected.blockers.map((blocker) => blocker.code)).not.toContain('DIRECTION_UNKNOWN');
    expect(corrected.draft.orders).toEqual([expect.objectContaining({ id: 'OP-1', direction: 'IN' })]);
  });

  it('replays a correction against only its target version without mutating imported batches', () => {
    const original = createImportReview({ parsed: parsed([{ ...row, finalidade_codigo: 'SERVICO' }]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z' });
    const second = applyImportCommand(original, {
      kind: 'INCORPORATE_BATCH', parsed: { ...parsed([{ ...row, valor_brl: '200', finalidade_codigo: 'SERVICO' }]), sha256: 'b'.repeat(64) }, at: '2026-09-23T12:01:00.000Z',
    });
    const firstVersion = second.batches[0]!.rows[0]!.versionId;
    const corrected = applyImportCommand(second, {
      kind: 'CORRECT_FIELD', versionId: firstVersion, operationId: 'OP-1', field: 'valueBrl', rawValue: '150', actionId: 'correction-version-1', at: '2026-09-23T12:02:00.000Z',
    });
    const resolved = applyImportCommand(corrected, {
      kind: 'RESOLVE_CONFLICT', operationId: 'OP-1', selectedVersionId: firstVersion, eventId: 'resolve-version-1', at: '2026-09-23T12:03:00.000Z',
    });

    expect(second.batches[0]!.rows[0]!.raw.valor_brl).toBe('100,50');
    expect(corrected.batches[0]!.rows[0]!.raw.valor_brl).toBe('100,50');
    expect(resolved.draft.orders.find((order) => order.id === 'OP-1')?.valueBrl).toBe('150');
  });

  it('keeps same-file duplicates as a resolvable conflict and does not let correction bypass it', () => {
    const duplicate = createImportReview({
      parsed: parsed([{ ...row, finalidade_codigo: 'SERVICO' }, { ...row, valor_brl: '200', finalidade_codigo: 'SERVICO' }]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z',
    });
    const firstVersion = duplicate.batches[0]!.rows[0]!.versionId;
    const corrected = applyImportCommand(duplicate, {
      kind: 'CORRECT_FIELD', versionId: firstVersion, operationId: 'OP-1', field: 'purposeCode', rawValue: 'SERVICO', actionId: 'irrelevant-correction', at: '2026-09-23T12:01:00.000Z',
    });

    expect(corrected.blockers.map((blocker) => blocker.code)).toContain('DUPLICATE_UNRESOLVED');
    const resolved = applyImportCommand(corrected, {
      kind: 'RESOLVE_CONFLICT', operationId: 'OP-1', selectedVersionId: firstVersion, eventId: 'resolution-1', at: '2026-09-23T12:02:00.000Z',
    });
    expect(resolved.blockers.map((blocker) => blocker.code)).not.toContain('DUPLICATE_UNRESOLVED');
  });

  it('requires explicit resolution for identical same-file duplicate IDs too', () => {
    const duplicate = createImportReview({
      parsed: parsed([{ ...row, finalidade_codigo: 'SERVICO' }, { ...row, finalidade_codigo: 'SERVICO' }]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z', positionIdentified: true,
    });
    const firstVersion = duplicate.batches[0]!.rows[0]!.versionId;

    expect(duplicate.blockers.map((blocker) => blocker.code)).toContain('DUPLICATE_UNRESOLVED');
    const resolved = applyImportCommand(duplicate, { kind: 'RESOLVE_CONFLICT', operationId: 'OP-1', selectedVersionId: firstVersion, eventId: 'resolve-identical', at: '2026-09-23T12:01:00.000Z' });
    expect(resolved.blockers.map((blocker) => blocker.code)).not.toContain('DUPLICATE_UNRESOLVED');
  });

  it('preserves the first imported value as original across repeated corrections', () => {
    const original = createImportReview({ parsed: parsed([{ ...row, finalidade_codigo: 'SERVICO' }]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z' });
    const versionId = original.batches[0]!.rows[0]!.versionId;
    const once = applyImportCommand(original, { kind: 'CORRECT_FIELD', versionId, operationId: 'OP-1', field: 'valueBrl', rawValue: '125', actionId: 'correction-1', at: '2026-09-23T12:01:00.000Z' });
    const twice = applyImportCommand(once, { kind: 'CORRECT_FIELD', versionId, operationId: 'OP-1', field: 'valueBrl', rawValue: '150', actionId: 'correction-2', at: '2026-09-23T12:02:00.000Z' });

    expect(twice.draft.corrections.at(-1)).toMatchObject({ originalValue: '100.5', previousValue: '125', nextValue: '150' });
  });

  it('increments the semantic draft revision when an alias changes identity', () => {
    const original = createImportReview({ parsed: parsed([{ ...row, finalidade_codigo: 'SERVICO' }, { ...row, operacao_id: 'OP-2', cliente_nome: 'Órbita Comercial', finalidade_codigo: 'SERVICO' }]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z' });
    const target = original.draft.orders[0]!;
    const associated = applyImportCommand(original, { kind: 'ASSOCIATE_ALIAS', alias: 'Órbita Comercial', canonicalClientId: target.clientId, eventId: 'alias-revision', at: '2026-09-23T12:01:00.000Z' });

    expect(associated.draft.revision).toBe(original.draft.revision + 1);
  });

  it('increments semantic revision exactly once across correction then alias', () => {
    const original = createImportReview({ parsed: parsed([{ ...row, finalidade_codigo: 'SERVICO' }, { ...row, operacao_id: 'OP-2', cliente_nome: 'Órbita Comercial', finalidade_codigo: 'SERVICO' }]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z', positionIdentified: true });
    const corrected = applyImportCommand(original, { kind: 'CORRECT_FIELD', versionId: original.batches[0]!.rows[0]!.versionId, operationId: 'OP-1', field: 'valueBrl', rawValue: '125', actionId: 'revision-correction', at: '2026-09-23T12:01:00.000Z' });
    const alias = applyImportCommand(corrected, { kind: 'ASSOCIATE_ALIAS', alias: 'Órbita Comercial', canonicalClientId: corrected.draft.orders.find((order) => order.id === 'OP-1')!.clientId, eventId: 'revision-alias', at: '2026-09-23T12:02:00.000Z' });

    expect(corrected.draft.revision).toBe(original.draft.revision + 1);
    expect(alias.draft.revision).toBe(corrected.draft.revision + 1);
  });

  it('lists every active source deterministically after batch incorporation', () => {
    const original = createImportReview({ parsed: parsed([{ ...row, finalidade_codigo: 'SERVICO' }]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z', positionIdentified: true });
    const combined = applyImportCommand(original, { kind: 'INCORPORATE_BATCH', parsed: { ...parsed([{ ...row, operacao_id: 'OP-2', finalidade_codigo: 'SERVICO' }]), sha256: 'b'.repeat(64), byteSize: 456 }, at: '2026-09-23T12:01:00.000Z' });

    expect(combined.draft.sourceManifest.files).toEqual([
      expect.objectContaining({ sha256: 'a'.repeat(64), sizeBytes: 123 }),
      expect.objectContaining({ sha256: 'b'.repeat(64), sizeBytes: 456 }),
    ]);
  });

  it('keeps an active zero-row batch in provenance and removes it after revert', () => {
    const original = createImportReview({ parsed: parsed([{ ...row, finalidade_codigo: 'SERVICO' }]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z', positionIdentified: true });
    const combined = applyImportCommand(original, { kind: 'INCORPORATE_BATCH', parsed: { ...parsed([]), sha256: 'c'.repeat(64), byteSize: 789 }, at: '2026-09-23T12:01:00.000Z' });
    const reverted = applyImportCommand(combined, { kind: 'REVERT_BATCH', batchId: combined.batches[1]!.id, eventId: 'revert-empty', at: '2026-09-23T12:02:00.000Z' });

    expect(combined.draft.sourceManifest.files.map((file) => file.sha256)).toEqual(['a'.repeat(64), 'c'.repeat(64)]);
    expect(reverted.draft.sourceManifest.files.map((file) => file.sha256)).toEqual(['a'.repeat(64)]);
  });

  it('turns malformed declared totals into a stable blocker instead of throwing', () => {
    expect(() => createImportReview({ parsed: parsed([{ ...row, finalidade_codigo: 'SERVICO' }]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z', positionIdentified: true, controlTotals: { out: 'not-a-decimal', in: '0' } })).not.toThrow();
    const review = createImportReview({ parsed: parsed([{ ...row, finalidade_codigo: 'SERVICO' }]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z', positionIdentified: true, controlTotals: { out: 'not-a-decimal', in: '0' } });
    expect(review.blockers.map((blocker) => blocker.code)).toContain('TOTAL_INVALID');
  });

  it('blocks confirmation when no operation remains selected', () => {
    const review = createImportReview({ parsed: parsed([]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z', positionIdentified: true });
    expect(review.blockers.map((blocker) => blocker.code)).toContain('ZERO_SELECTED_OPERATIONS');
  });

  it('compares declared control totals as Decimal values', () => {
    const equal = createImportReview({ parsed: parsed([{ ...row, finalidade_codigo: 'SERVICO' }]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z', controlTotals: { out: '100.50', in: '0.0' } });
    const divergent = createImportReview({ parsed: parsed([{ ...row, finalidade_codigo: 'SERVICO' }]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z', controlTotals: { out: '100.51', in: '0' } });

    expect(equal.blockers.map((blocker) => blocker.code)).not.toContain('TOTAL_DIVERGENT');
    expect(divergent.blockers.map((blocker) => blocker.code)).toContain('TOTAL_DIVERGENT');
  });

  it('excludes an invalid row from blockers, defaults an unverified position to blocked, and blocks cross-owner company use', () => {
    const invalid = createImportReview({ parsed: parsed([{ ...row, direcao: 'UNKNOWN' }]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z' });
    const excluded = applyImportCommand(invalid, { kind: 'EXCLUDE_OPERATION', operationId: 'OP-1', eventId: 'exclude-invalid', at: '2026-09-23T12:01:00.000Z' });
    const restored = applyImportCommand(excluded, { kind: 'RESTORE_OPERATION', operationId: 'OP-1', eventId: 'restore-invalid', at: '2026-09-23T12:02:00.000Z' });
    const unknownPosition = createImportReview({ parsed: parsed([{ ...row, finalidade_codigo: 'SERVICO' }]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z' });
    const foreignCompany = createImportReview({ parsed: parsed([{ ...row, finalidade_codigo: 'SERVICO' }]), company: { ...company, ownerSub: 'other-owner' }, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z', positionIdentified: true });

    expect(excluded.blockers.map((blocker) => blocker.code)).not.toContain('DIRECTION_UNKNOWN');
    expect(restored.blockers.map((blocker) => blocker.code)).toContain('DIRECTION_UNKNOWN');
    expect(unknownPosition.blockers.map((blocker) => blocker.code)).toContain('POSITION_UNIDENTIFIED');
    expect(foreignCompany.blockers.map((blocker) => blocker.code)).toContain('COMPANY_OWNER_MISMATCH');
  });
});
