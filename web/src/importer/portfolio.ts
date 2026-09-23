import type { ImportBatch, ImportEvent, ImportPortfolio, ImportedVersionRow, PortfolioOperation, PortfolioProjection, PortfolioVersion, RawOperationCells } from './domain';
import { validateImportedRows } from './validation';

function ordered<T extends { readonly batchSequence: number }>(values: readonly T[]): T[] { return [...values].sort((left, right) => left.batchSequence - right.batchSequence); }
function orderedEvents(events: readonly ImportEvent[]): ImportEvent[] { return [...events].sort((left, right) => left.eventSequence - right.eventSequence); }

export function activeBatchIds(portfolio: ImportPortfolio): Set<string> {
  const active = new Set(portfolio.batches.map((batch) => batch.id));
  for (const event of orderedEvents(portfolio.events)) {
    if (event.kind === 'BATCH_REVERTED') active.delete(event.batchId);
    if (event.kind === 'BATCH_IMPORTED') active.add(event.batchId);
  }
  return active;
}

function sourceField(event: Extract<ImportEvent, { kind: 'OPERATION_CORRECTED' }>): keyof RawOperationCells {
  switch (event.field) {
    case 'direction': return 'direcao'; case 'knownDate': return 'data_conhecida'; case 'deadlineDate': return 'data_limite'; case 'valueBrl': return 'valor_brl'; case 'purposeCode': return 'finalidade_codigo';
  }
}

function effectiveRows(portfolio: ImportPortfolio): ImportedVersionRow[] {
  const active = activeBatchIds(portfolio);
  const corrections = orderedEvents(portfolio.events).filter((event): event is Extract<ImportEvent, { kind: 'OPERATION_CORRECTED' }> => event.kind === 'OPERATION_CORRECTED');
  return ordered(portfolio.batches).flatMap((batch) => {
    if (!active.has(batch.id)) return [];
    return [...batch.rows].sort((left, right) => left.rowNumber - right.rowNumber).map((row) => {
      const raw = corrections.filter((event) => event.versionId === row.versionId).reduce<RawOperationCells>((current, event) => ({ ...current, [sourceField(event)]: event.rawValue }), row.raw);
      const revalidated = validateImportedRows([raw]).rows[0];
      if (revalidated === undefined) throw new Error('ROW_REVALIDATION_FAILED');
      return { ...row, raw, normalized: revalidated.normalized, errors: revalidated.errors };
    });
  });
}

function versions(portfolio: ImportPortfolio, rows: readonly ImportedVersionRow[]): PortfolioVersion[] {
  const byVersionId = new Map(rows.map((row) => [row.versionId, row]));
  return ordered(portfolio.batches).flatMap((batch) => [...batch.rows].sort((left, right) => left.rowNumber - right.rowNumber).flatMap((stored): PortfolioVersion[] => {
    const row = byVersionId.get(stored.versionId);
    if (row === undefined || row.normalized === null) return [];
    return [{ versionId: row.versionId, batchId: batch.id, batchSequence: batch.batchSequence, rowNumber: row.rowNumber, canonicalClientId: row.canonicalClientId, operation: row.normalized }];
  }));
}

function canonicalContent(version: PortfolioVersion): string { const operation = version.operation; return JSON.stringify([version.canonicalClientId, operation.direction, operation.knownDate, operation.deadlineDate, operation.valueBrl, operation.purposeCode]); }
function nextEventSequence(portfolio: ImportPortfolio): number { return portfolio.events.reduce((maximum, event) => Math.max(maximum, event.eventSequence), 0) + 1; }
function append(portfolio: ImportPortfolio, event: ImportEvent): ImportPortfolio { return { revision: portfolio.revision + 1, batches: portfolio.batches, events: [...portfolio.events, event] }; }

export function projectPortfolio(portfolio: ImportPortfolio): PortfolioProjection {
  const rows = effectiveRows(portfolio);
  const allVersions = versions(portfolio, rows);
  const byOperationId = new Map<string, PortfolioVersion[]>();
  for (const version of allVersions) byOperationId.set(version.operation.operationId, [...(byOperationId.get(version.operation.operationId) ?? []), version]);
  const currentOperations: PortfolioOperation[] = [];
  const conflicts: PortfolioProjection['conflicts'][number][] = [];
  const resolutions = new Map<string, string>();
  for (const event of orderedEvents(portfolio.events)) if (event.kind === 'CONFLICT_RESOLVED') resolutions.set(event.operationId, event.selectedVersionId);
  for (const [operationId, candidates] of byOperationId) {
    const byContent = new Map<string, PortfolioVersion[]>();
    for (const candidate of candidates) { const key = canonicalContent(candidate); byContent.set(key, [...(byContent.get(key) ?? []), candidate]); }
    if (byContent.size === 1) {
      const current = candidates[0];
      if (current !== undefined) currentOperations.push({ ...current, operationId, originVersionIds: candidates.map((candidate) => candidate.versionId) });
      continue;
    }
    const selected = candidates.find((candidate) => candidate.versionId === resolutions.get(operationId));
    if (selected === undefined) { conflicts.push({ operationId, versionIds: candidates.map((candidate) => candidate.versionId) }); continue; }
    currentOperations.push({ ...selected, operationId, originVersionIds: (byContent.get(canonicalContent(selected)) ?? [selected]).map((candidate) => candidate.versionId) });
  }
  return { rows, versions: allVersions, currentOperations, conflicts };
}

export function incorporateBatch(portfolio: ImportPortfolio, batch: ImportBatch): ImportPortfolio {
  if (portfolio.batches.some((candidate) => candidate.id === batch.id)) throw new Error(`BATCH_ALREADY_EXISTS: lote ${batch.id} já existe`);
  const event: ImportEvent = { kind: 'BATCH_IMPORTED', id: `${batch.id}:imported`, eventSequence: nextEventSequence(portfolio), occurredAt: batch.importedAt, batchId: batch.id };
  return { ...append(portfolio, event), batches: [...portfolio.batches, batch] };
}

export function resolveVersionConflict(portfolio: ImportPortfolio, command: Readonly<{ operationId: string; selectedVersionId: string; eventId: string; at: string }>): ImportPortfolio {
  const conflict = projectPortfolio(portfolio).conflicts.find((item) => item.operationId === command.operationId);
  if (conflict === undefined || !conflict.versionIds.includes(command.selectedVersionId)) throw new Error('VERSION_NOT_ACTIVE: versão não está em conflito ativo');
  return append(portfolio, { kind: 'CONFLICT_RESOLVED', id: command.eventId, eventSequence: nextEventSequence(portfolio), occurredAt: command.at, operationId: command.operationId, selectedVersionId: command.selectedVersionId });
}

export function revertBatch(portfolio: ImportPortfolio, batchId: string, eventId: string, at: string): ImportPortfolio {
  if (!activeBatchIds(portfolio).has(batchId)) throw new Error(`BATCH_NOT_ACTIVE: lote ${batchId} não está ativo`);
  return append(portfolio, { kind: 'BATCH_REVERTED', id: eventId, eventSequence: nextEventSequence(portfolio), occurredAt: at, batchId });
}
