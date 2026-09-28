import { describe, expect, it } from 'vitest';

import type { BoardRow } from '../pages/ComparisonBoardPage';
import { buildBoardChatContext } from './boardContext';

function row(changes: Partial<BoardRow> = {}): BoardRow {
  return {
    key: 'study-a:scenario-a', studyId: 'study-a', scenarioId: 'scenario-a', executionId: 'run-a',
    studyName: 'Estudo A', scenarioName: 'Cenário A', origin: 'Sintético', windowDays: 7,
    orderCount: 2, inBrl: '10', outBrl: '20', netability: '0.5', baselineTotal: '8',
    nettedTotal: '3.5', savings: '4.5', diagnosticExecutionId: 'run-a',
    finishedAt: '2026-09-26T12:00:00Z', breakdown: null, ...changes,
  };
}

describe('board chat context', () => {
  it('publishes exactly the supplied selected rows with complete evidence', async () => {
    const context = await buildBoardChatContext([
      row({ key: 'study-b:scenario-b', studyId: 'study-b', scenarioId: 'scenario-b' }), row(),
    ], '2026-09-26T12:00:00Z');
    expect(context.kind).toBe('BOARD');
    expect(context.document.rows.map((item) => item.rowKey)).toEqual([
      'study-a:scenario-a', 'study-b:scenario-b',
    ]);
    expect(context.document.evidenceIndex['BOARD:study-a:scenario-a:savingsBrl']).toEqual({
      rowKey: 'study-a:scenario-a', field: 'savingsBrl', value: '4.5',
    });
    expect(Object.keys(context.document.evidenceIndex)).toHaveLength(28);
    expect(JSON.stringify(context.document)).not.toContain('breakdown');
  });

  it('keeps identity stable across generated timestamps and rejects unsafe boards', async () => {
    const first = await buildBoardChatContext([row()], '2026-09-26T12:00:00Z');
    const second = await buildBoardChatContext([row()], '2026-09-26T12:01:00Z');
    expect(second.document.contextFingerprint).toBe(first.document.contextFingerprint);
    expect((await buildBoardChatContext([row({ savings: '4.6' })])).document.contextFingerprint)
      .not.toBe(first.document.contextFingerprint);
    await expect(buildBoardChatContext(Array.from({ length: 101 }, (_, index) => row({ key: `row-${index}` }))))
      .rejects.toThrow(/100/);
    await expect(buildBoardChatContext([row({ netability: '1.1' })])).rejects.toThrow(/netabilidade/);
    await expect(buildBoardChatContext([row(), row()])).rejects.toThrow(/duplicada/);
  });
});
