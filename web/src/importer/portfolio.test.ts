import { describe, expect, it } from 'vitest';

import type { ImportBatch, ImportPortfolio, ImportedVersionRow } from './domain';
import {
  incorporateBatch,
  projectPortfolio,
  resolveVersionConflict,
  revertBatch,
} from './portfolio';

function row(versionId: string, operationId: string, valueBrl: string): ImportedVersionRow {
  return {
    versionId,
    canonicalClientId: 'client-1',
    rowNumber: 2,
    normalized: {
      operationId,
      clientName: 'Cliente',
      profileClassification: null,
      direction: 'OUT',
      knownDate: '2026-10-17',
      deadlineDate: '2026-10-19',
      valueBrl,
      purposeCode: 'SERVICO',
    },
    errors: [],
  };
}

function batch(id: string, batchSequence: number, rows: readonly ImportedVersionRow[]): ImportBatch {
  return { id, batchSequence, importedAt: '2026-09-23T12:00:00.000Z', rows };
}

function portfolio(batches: readonly ImportBatch[] = []): ImportPortfolio {
  return { revision: 1, batches, events: [] };
}

describe('projectPortfolio', () => {
  it('keeps a new operation as the current version', () => {
    const projected = projectPortfolio(portfolio([
      batch('batch-1', 1, [row('version-1', 'OP-1', '100')]),
    ]));

    expect(projected.currentOperations).toEqual([
      expect.objectContaining({ operationId: 'OP-1', versionId: 'version-1' }),
    ]);
    expect(projected.conflicts).toEqual([]);
  });

  it('coalesces identical repeated operation IDs without choosing a hidden winner', () => {
    const projected = projectPortfolio(portfolio([
      batch('batch-1', 1, [row('version-1', 'OP-1', '100')]),
      batch('batch-2', 2, [row('version-2', 'OP-1', '100')]),
    ]));

    expect(projected.currentOperations).toEqual([
      expect.objectContaining({
        operationId: 'OP-1',
        originVersionIds: ['version-1', 'version-2'],
      }),
    ]);
  });

  it('marks divergent repeated IDs as a conflict until an explicit resolution', () => {
    const source = portfolio([
      batch('batch-1', 1, [row('version-1', 'OP-1', '100')]),
      batch('batch-2', 2, [row('version-2', 'OP-1', '200')]),
    ]);

    expect(projectPortfolio(source).conflicts).toEqual([
      { operationId: 'OP-1', versionIds: ['version-1', 'version-2'] },
    ]);

    const resolved = resolveVersionConflict(source, {
      operationId: 'OP-1', selectedVersionId: 'version-2', eventId: 'event-1', at: '2026-09-23T12:01:00.000Z',
    });
    expect(projectPortfolio(resolved).currentOperations).toEqual([
      expect.objectContaining({ versionId: 'version-2' }),
    ]);
  });

  it('reverts a later batch deterministically back to the prior projection', () => {
    const source = portfolio([batch('batch-1', 1, [row('version-1', 'OP-1', '100')])]);
    const before = projectPortfolio(source);
    const withLaterBatch = incorporateBatch(source, batch('batch-2', 2, [row('version-2', 'OP-2', '200')]));

    expect(projectPortfolio(revertBatch(withLaterBatch, 'batch-2', 'event-2', '2026-09-23T12:02:00.000Z'))).toEqual(before);
  });
});
