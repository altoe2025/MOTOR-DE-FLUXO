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
    const review = createImportReview({ parsed: parsed([row]), company, ownerSub: 'owner-1', now: '2026-09-23T12:00:00.000Z' });

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
      kind: 'CORRECT_FIELD', operationId: 'OP-1', field: 'valueBrl', rawValue: '125,75', actionId: 'correction-1', at: '2026-09-23T12:01:00.000Z',
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
      kind: 'CORRECT_FIELD', operationId: 'OP-1', field: 'direction', rawValue: 'IN', actionId: 'correction-direction', at: '2026-09-23T12:01:00.000Z',
    });

    expect(corrected.blockers.map((blocker) => blocker.code)).not.toContain('DIRECTION_UNKNOWN');
    expect(corrected.draft.orders).toEqual([expect.objectContaining({ id: 'OP-1', direction: 'IN' })]);
  });
});
