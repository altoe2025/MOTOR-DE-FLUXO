import type {
  ImportBatch,
  ImportEvent,
  ImportPortfolio,
  PortfolioOperation,
  PortfolioProjection,
  PortfolioVersion,
} from './domain';

function ordered<T extends { readonly batchSequence: number }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => left.batchSequence - right.batchSequence);
}

function orderedEvents(events: readonly ImportEvent[]): ImportEvent[] {
  return [...events].sort((left, right) => left.eventSequence - right.eventSequence);
}

function activeBatchIds(portfolio: ImportPortfolio): Set<string> {
  const active = new Set(portfolio.batches.map((batch) => batch.id));
  for (const event of orderedEvents(portfolio.events)) {
    if (event.kind === 'BATCH_REVERTED') active.delete(event.batchId);
    if (event.kind === 'BATCH_IMPORTED') active.add(event.batchId);
  }
  return active;
}

function versions(portfolio: ImportPortfolio): PortfolioVersion[] {
  const active = activeBatchIds(portfolio);
  return ordered(portfolio.batches).flatMap((batch) => {
    if (!active.has(batch.id)) return [];
    return [...batch.rows]
      .sort((left, right) => left.rowNumber - right.rowNumber)
      .flatMap((row): PortfolioVersion[] => row.normalized === null ? [] : [{
        versionId: row.versionId,
        batchId: batch.id,
        batchSequence: batch.batchSequence,
        rowNumber: row.rowNumber,
        canonicalClientId: row.canonicalClientId,
        operation: row.normalized,
      }]);
  });
}

function canonicalContent(version: PortfolioVersion): string {
  const operation = version.operation;
  return JSON.stringify([
    version.canonicalClientId,
    operation.direction,
    operation.knownDate,
    operation.deadlineDate,
    operation.valueBrl,
    operation.purposeCode,
  ]);
}

function latestResolutions(events: readonly ImportEvent[]): Map<string, string> {
  const resolutions = new Map<string, string>();
  for (const event of orderedEvents(events)) {
    if (event.kind === 'CONFLICT_RESOLVED') {
      resolutions.set(event.operationId, event.selectedVersionId);
    }
  }
  return resolutions;
}

function nextEventSequence(portfolio: ImportPortfolio): number {
  return portfolio.events.reduce((maximum, event) => Math.max(maximum, event.eventSequence), 0) + 1;
}

function append(portfolio: ImportPortfolio, event: ImportEvent): ImportPortfolio {
  return {
    revision: portfolio.revision + 1,
    batches: portfolio.batches,
    events: [...portfolio.events, event],
  };
}

export function projectPortfolio(portfolio: ImportPortfolio): PortfolioProjection {
  const allVersions = versions(portfolio);
  const byOperationId = new Map<string, PortfolioVersion[]>();
  for (const version of allVersions) {
    const candidates = byOperationId.get(version.operation.operationId) ?? [];
    candidates.push(version);
    byOperationId.set(version.operation.operationId, candidates);
  }

  const currentOperations: PortfolioOperation[] = [];
  const conflicts: PortfolioProjection['conflicts'][number][] = [];
  const resolutions = latestResolutions(portfolio.events);
  for (const [operationId, candidates] of byOperationId) {
    const byContent = new Map<string, PortfolioVersion[]>();
    for (const candidate of candidates) {
      const equivalent = byContent.get(canonicalContent(candidate)) ?? [];
      equivalent.push(candidate);
      byContent.set(canonicalContent(candidate), equivalent);
    }
    if (byContent.size === 1) {
      const current = candidates[0];
      if (current === undefined) continue;
      currentOperations.push({ ...current, operationId, originVersionIds: candidates.map((candidate) => candidate.versionId) });
      continue;
    }
    const selected = candidates.find((candidate) => candidate.versionId === resolutions.get(operationId));
    if (selected === undefined) {
      conflicts.push({ operationId, versionIds: candidates.map((candidate) => candidate.versionId) });
      continue;
    }
    const equivalent = byContent.get(canonicalContent(selected)) ?? [selected];
    currentOperations.push({ ...selected, operationId, originVersionIds: equivalent.map((candidate) => candidate.versionId) });
  }
  return { versions: allVersions, currentOperations, conflicts };
}

export function incorporateBatch(portfolio: ImportPortfolio, batch: ImportBatch): ImportPortfolio {
  if (portfolio.batches.some((candidate) => candidate.id === batch.id)) {
    throw new Error(`BATCH_ALREADY_EXISTS: lote ${batch.id} já existe`);
  }
  const event: ImportEvent = {
    kind: 'BATCH_IMPORTED', id: `${batch.id}:imported`, eventSequence: nextEventSequence(portfolio),
    occurredAt: batch.importedAt, batchId: batch.id,
  };
  const appended = append(portfolio, event);
  return { ...appended, batches: [...portfolio.batches, batch] };
}

export function resolveVersionConflict(
  portfolio: ImportPortfolio,
  command: Readonly<{ operationId: string; selectedVersionId: string; eventId: string; at: string }>,
): ImportPortfolio {
  const conflict = projectPortfolio(portfolio).conflicts.find((item) => item.operationId === command.operationId);
  if (conflict === undefined || !conflict.versionIds.includes(command.selectedVersionId)) {
    throw new Error('VERSION_NOT_ACTIVE: versão não está em conflito ativo');
  }
  return append(portfolio, {
    kind: 'CONFLICT_RESOLVED', id: command.eventId, eventSequence: nextEventSequence(portfolio),
    occurredAt: command.at, operationId: command.operationId, selectedVersionId: command.selectedVersionId,
  });
}

export function revertBatch(portfolio: ImportPortfolio, batchId: string, eventId: string, at: string): ImportPortfolio {
  if (!activeBatchIds(portfolio).has(batchId)) {
    throw new Error(`BATCH_NOT_ACTIVE: lote ${batchId} não está ativo`);
  }
  return append(portfolio, {
    kind: 'BATCH_REVERTED', id: eventId, eventSequence: nextEventSequence(portfolio), occurredAt: at, batchId,
  });
}
