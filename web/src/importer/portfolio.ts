import type {
  ConflictResolution,
  ImportBatch,
  ImportEvent,
  ImportStudy,
  PortfolioOperation,
  PortfolioProjection,
  PortfolioVersion,
} from './domain';

function fail(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function assertUniqueSequence(
  values: readonly number[],
  code: string,
): void {
  const seen = new Set<number>();
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 1 || seen.has(value)) {
      fail(code, 'sequência deve ser inteira, positiva e única');
    }
    seen.add(value);
  }
}

function orderedBatches(study: ImportStudy): ImportBatch[] {
  assertUniqueSequence(
    study.batches.map((batch) => batch.batchSequence),
    'INVALID_BATCH_SEQUENCE',
  );
  return [...study.batches].sort(
    (left, right) => left.batchSequence - right.batchSequence,
  );
}

function orderedEvents(study: ImportStudy): ImportEvent[] {
  assertUniqueSequence(
    study.events.map((event) => event.eventSequence),
    'INVALID_EVENT_SEQUENCE',
  );
  return [...study.events].sort(
    (left, right) => left.eventSequence - right.eventSequence,
  );
}

function activeBatchIds(study: ImportStudy): Set<string> {
  const active = new Set(study.batches.map((batch) => batch.id));
  for (const event of orderedEvents(study)) {
    if (event.kind === 'BATCH_IMPORTED') {
      active.add(event.batchId);
    } else if (event.kind === 'BATCH_REVERTED') {
      active.delete(event.batchId);
    }
  }
  return active;
}

function duplicateIdsInBatch(batch: ImportBatch): Set<string> {
  const counts = new Map<string, number>();
  for (const row of batch.rows) {
    const id = row.normalized?.operationId;
    if (id !== undefined) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return new Set(
    [...counts].filter(([, count]) => count > 1).map(([id]) => id),
  );
}

function collectVersions(study: ImportStudy): PortfolioVersion[] {
  const active = activeBatchIds(study);
  const versions: PortfolioVersion[] = [];
  const versionIds = new Set<string>();

  for (const batch of orderedBatches(study)) {
    if (!active.has(batch.id)) {
      continue;
    }
    assertUniqueSequence(
      batch.rows.map((row) => row.rowNumber),
      'INVALID_ROW_NUMBER',
    );
    const duplicates = duplicateIdsInBatch(batch);
    const rows = [...batch.rows].sort(
      (left, right) => left.rowNumber - right.rowNumber,
    );
    for (const row of rows) {
      if (
        row.normalized === null
        || duplicates.has(row.normalized.operationId)
      ) {
        continue;
      }
      if (versionIds.has(row.versionId)) {
        fail('DUPLICATE_VERSION_ID', `versão repetida ${row.versionId}`);
      }
      versionIds.add(row.versionId);
      versions.push({
        versionId: row.versionId,
        batchId: batch.id,
        batchSequence: batch.batchSequence,
        rowNumber: row.rowNumber,
        canonicalClientId: row.canonicalClientId,
        operation: row.normalized,
      });
    }
  }
  return versions;
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

function latestResolutions(study: ImportStudy): Map<string, string> {
  const resolutions = new Map<string, string>();
  for (const event of orderedEvents(study)) {
    if (event.kind === 'CONFLICT_RESOLVED') {
      resolutions.set(event.operationId, event.selectedVersionId);
    }
  }
  return resolutions;
}

function asCurrent(
  version: PortfolioVersion,
  equivalent: readonly PortfolioVersion[],
): PortfolioOperation {
  return {
    ...version,
    operationId: version.operation.operationId,
    originVersionIds: equivalent.map((candidate) => candidate.versionId),
  };
}

export function projectPortfolio(study: ImportStudy): PortfolioProjection {
  const versions = collectVersions(study);
  const versionsByOperationId: Record<string, PortfolioVersion[]> = {};
  for (const version of versions) {
    const id = version.operation.operationId;
    (versionsByOperationId[id] ??= []).push(version);
  }

  const resolutions = latestResolutions(study);
  const currentOperations: PortfolioOperation[] = [];
  const conflicts: PortfolioProjection['conflicts'] = [];

  for (const [operationId, candidates] of Object.entries(
    versionsByOperationId,
  )) {
    const byContent = new Map<string, PortfolioVersion[]>();
    for (const candidate of candidates) {
      const key = canonicalContent(candidate);
      const equivalent = byContent.get(key) ?? [];
      equivalent.push(candidate);
      byContent.set(key, equivalent);
    }

    if (byContent.size === 1) {
      const firstCandidate = candidates[0];
      if (firstCandidate === undefined) {
        return fail(
          'EMPTY_OPERATION_VERSIONS',
          `operação ${operationId} não possui versão`,
        );
      }
      currentOperations.push(asCurrent(firstCandidate, candidates));
      continue;
    }

    const selectedVersionId = resolutions.get(operationId);
    const selected = candidates.find(
      (candidate) => candidate.versionId === selectedVersionId,
    );
    if (selected === undefined) {
      conflicts.push({
        operationId,
        versionIds: candidates.map((candidate) => candidate.versionId),
      });
      continue;
    }
    currentOperations.push(asCurrent(
      selected,
      byContent.get(canonicalContent(selected)) ?? [selected],
    ));
  }

  return {
    versions,
    versionsByOperationId,
    currentOperations,
    conflicts,
    counts: {
      versions: versions.length,
      currentOperations: currentOperations.length,
      conflicts: conflicts.length,
    },
  };
}

function nextEventSequence(study: ImportStudy): number {
  return study.events.reduce(
    (maximum, event) => Math.max(maximum, event.eventSequence),
    0,
  ) + 1;
}

function appendEvent(
  study: ImportStudy,
  event: ImportEvent,
  updatedAtUtc: string,
): ImportStudy {
  return {
    ...study,
    revision: study.revision + 1,
    updatedAtUtc,
    events: [...study.events, event],
  };
}

export function incorporateBatch(
  study: ImportStudy,
  batch: ImportBatch,
): ImportStudy {
  if (batch.studyId !== study.id) {
    return fail('STUDY_ID_MISMATCH', 'lote pertence a outro estudo');
  }
  if (study.batches.some((candidate) => candidate.id === batch.id)) {
    return fail('BATCH_ALREADY_EXISTS', `lote repetido ${batch.id}`);
  }
  if (study.batches.some(
    (candidate) => candidate.batchSequence === batch.batchSequence,
  )) {
    return fail(
      'INVALID_BATCH_SEQUENCE',
      `sequência repetida ${batch.batchSequence}`,
    );
  }
  const eventSequence = nextEventSequence(study);
  return {
    ...appendEvent(study, {
      kind: 'BATCH_IMPORTED',
      id: `${batch.id}:imported`,
      eventSequence,
      occurredAtUtc: batch.importedAtUtc,
      batchId: batch.id,
    }, batch.importedAtUtc),
    batches: [...study.batches, batch],
  };
}

export function resolveVersionConflict(
  study: ImportStudy,
  resolution: ConflictResolution,
): ImportStudy {
  const projection = projectPortfolio(study);
  const active = projection.versionsByOperationId[resolution.operationId] ?? [];
  if (!active.some(
    (version) => version.versionId === resolution.selectedVersionId,
  )) {
    return fail(
      'VERSION_NOT_ACTIVE',
      `versão ${resolution.selectedVersionId} não está ativa`,
    );
  }
  if (new Set(active.map(canonicalContent)).size < 2) {
    return fail(
      'CONFLICT_NOT_FOUND',
      `operação ${resolution.operationId} não possui conflito`,
    );
  }
  const eventSequence = nextEventSequence(study);
  return appendEvent(study, {
    kind: 'CONFLICT_RESOLVED',
    id: `${resolution.selectedVersionId}:resolved:${eventSequence}`,
    eventSequence,
    occurredAtUtc: study.updatedAtUtc,
    operationId: resolution.operationId,
    selectedVersionId: resolution.selectedVersionId,
  }, study.updatedAtUtc);
}

export function revertBatch(
  study: ImportStudy,
  batchId: string,
): ImportStudy {
  if (!study.batches.some((batch) => batch.id === batchId)) {
    return fail('BATCH_NOT_FOUND', `lote ${batchId} não existe`);
  }
  if (!activeBatchIds(study).has(batchId)) {
    return fail('BATCH_NOT_ACTIVE', `lote ${batchId} já foi revertido`);
  }
  const eventSequence = nextEventSequence(study);
  return appendEvent(study, {
    kind: 'BATCH_REVERTED',
    id: `${batchId}:reverted:${eventSequence}`,
    eventSequence,
    occurredAtUtc: study.updatedAtUtc,
    batchId,
  }, study.updatedAtUtc);
}
