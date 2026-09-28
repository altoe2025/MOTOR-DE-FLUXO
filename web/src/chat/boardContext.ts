import Decimal from 'decimal.js';

import { fingerprintContextDocument } from '../communication/evidence';
import type { BoardRow } from '../pages/ComparisonBoardPage';
import type { BoardChatContext, BoardChatDocument, BoardChatRow, BoardEvidence } from './chatContext';

const FIELDS = [
  'studyId', 'scenarioId', 'executionId', 'studyName', 'scenarioName', 'sourceLabel',
  'windowDays', 'orderCount', 'inBrl', 'outBrl', 'netability', 'baselineTotalBrl',
  'nettedTotalBrl', 'savingsBrl',
] as const satisfies readonly BoardEvidence['field'][];
const DECIMAL = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;

function assertRow(row: BoardChatRow): void {
  for (const value of [row.rowKey, row.studyId, row.scenarioId, row.executionId]) {
    if (value.length === 0 || value.length > 128) throw new Error('Identidade inválida no Quadro.');
  }
  for (const value of [row.studyName, row.scenarioName, row.sourceLabel]) {
    if (value.length === 0 || value.length > 200) throw new Error('Nome inválido no Quadro.');
  }
  if (!Number.isSafeInteger(row.windowDays) || row.windowDays < 1
    || !Number.isSafeInteger(row.orderCount) || row.orderCount < 0) throw new Error('Contagem inválida no Quadro.');
  for (const [field, value] of Object.entries({
    inBrl: row.inBrl, outBrl: row.outBrl, netability: row.netability,
    baselineTotalBrl: row.baselineTotalBrl, nettedTotalBrl: row.nettedTotalBrl, savingsBrl: row.savingsBrl,
  })) {
    if (!DECIMAL.test(value) || value.length > 80) throw new Error(`${field} não é decimal válido.`);
  }
  if (new Decimal(row.netability).lt(0) || new Decimal(row.netability).gt(1)) {
    throw new Error('A netabilidade deve ficar entre zero e um.');
  }
  for (const value of [row.inBrl, row.outBrl, row.baselineTotalBrl, row.nettedTotalBrl]) {
    if (new Decimal(value).lt(0)) throw new Error('Valor monetário do Quadro não pode ser negativo.');
  }
}

function project(row: BoardRow): BoardChatRow {
  return {
    rowKey: row.key, studyId: row.studyId, scenarioId: row.scenarioId, executionId: row.executionId,
    studyName: row.studyName, scenarioName: row.scenarioName, sourceLabel: row.origin,
    windowDays: row.windowDays, orderCount: row.orderCount, inBrl: row.inBrl, outBrl: row.outBrl,
    netability: row.netability, baselineTotalBrl: row.baselineTotal,
    nettedTotalBrl: row.nettedTotal, savingsBrl: row.savings,
  };
}

export async function buildBoardChatContext(
  selectedRows: readonly BoardRow[], generatedAt = new Date().toISOString(),
): Promise<BoardChatContext> {
  if (selectedRows.length > 100) throw new Error('O chat aceita no máximo 100 linhas do Quadro.');
  const rows = selectedRows.map(project).sort((left, right) => left.rowKey.localeCompare(right.rowKey));
  if (new Set(rows.map((row) => row.rowKey)).size !== rows.length) throw new Error('Linha duplicada no Quadro.');
  rows.forEach(assertRow);
  const evidenceIndex: Record<string, BoardEvidence> = {};
  for (const row of rows) for (const field of FIELDS) {
    evidenceIndex[`BOARD:${row.rowKey}:${field}`] = {
      rowKey: row.rowKey, field, value: String(row[field]),
    };
  }
  const unsigned = { apiVersion: '1.0.0' as const, generatedAt, rows, evidenceIndex };
  const document: BoardChatDocument = {
    ...unsigned, contextFingerprint: await fingerprintContextDocument(unsigned),
  };
  return { kind: 'BOARD', document };
}

export async function validateBoardChatDocument(document: BoardChatDocument): Promise<boolean> {
  try {
    if (document.rows.length > 100 || new Set(document.rows.map((row) => row.rowKey)).size !== document.rows.length) return false;
    document.rows.forEach(assertRow);
    const expected = new Set<string>();
    for (const row of document.rows) for (const field of FIELDS) {
      const id = `BOARD:${row.rowKey}:${field}`;
      expected.add(id);
      const evidence = document.evidenceIndex[id];
      if (evidence?.rowKey !== row.rowKey || evidence.field !== field || evidence.value !== String(row[field])) return false;
    }
    if (Object.keys(document.evidenceIndex).some((id) => !expected.has(id))) return false;
    return document.contextFingerprint === await fingerprintContextDocument(document);
  } catch {
    return false;
  }
}
