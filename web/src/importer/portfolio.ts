import type {
  ConflictResolution,
  EditableField,
  ImportBatch,
  ImportEvent,
  ImportIssue,
  ImportStudy,
  NormalizedOperation,
  PortfolioOperation,
  PortfolioProjection,
  PortfolioVersion,
  ProjectedOperation,
} from './domain';
import { parseCivilDate } from './dates';
import { parseBrlDecimal } from './decimals';
import { ImportValidationError } from './errors';
import {
  normalizeDirection,
  normalizePurposeCode,
} from './normalization';

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

function fieldValue(
  operation: NormalizedOperation,
  field: EditableField,
): string | null {
  return operation[field];
}

function withField(
  operation: NormalizedOperation,
  field: EditableField,
  value: string | null,
): NormalizedOperation {
  switch (field) {
    case 'direction':
      return { ...operation, direction: value as 'OUT' | 'IN' };
    case 'knownDate':
      return { ...operation, knownDate: value as NormalizedOperation['knownDate'] };
    case 'deadlineDate':
      return {
        ...operation,
        deadlineDate: value as NormalizedOperation['deadlineDate'],
      };
    case 'valueBrl':
      return { ...operation, valueBrl: value as string };
    case 'purposeCode':
      return { ...operation, purposeCode: value };
  }
}

function projectedOperations(
  study: ImportStudy,
  currentOperations: readonly PortfolioOperation[],
): {
  operations: ProjectedOperation[];
  excludedOperationIds: string[];
} {
  const originals = new Map(
    currentOperations.map((operation) => [
      operation.operationId,
      operation.operation,
    ]),
  );
  const working = new Map<string, {
    base: PortfolioOperation;
    operation: NormalizedOperation;
    edits: ProjectedOperation['audit']['edits'];
    invalidFields: Map<EditableField, ImportIssue>;
  }>();
  for (const operation of currentOperations) {
    working.set(operation.operationId, {
      base: operation,
      operation: { ...operation.operation },
      edits: [],
      invalidFields: new Map(),
    });
  }

  const excluded = new Set<string>();
  for (const event of orderedEvents(study)) {
    if (event.kind === 'OPERATION_EXCLUDED') {
      excluded.add(event.operationId);
      continue;
    }
    if (event.kind === 'OPERATION_RESTORED') {
      excluded.delete(event.operationId);
      continue;
    }
    if (event.kind !== 'OPERATION_EDITED') {
      continue;
    }
    const target = working.get(event.operationId);
    const original = originals.get(event.operationId);
    if (target === undefined || original === undefined) {
      continue;
    }
    const previousValue = fieldValue(target.operation, event.field);
    target.edits.push({
      eventId: event.id,
      at: event.occurredAtUtc,
      field: event.field,
      originalValue: fieldValue(original, event.field),
      previousValue,
      nextValue: event.normalizedValue,
      rawValue: event.rawValue,
      error: event.error,
    });
    if (event.error === null) {
      target.operation = withField(
        target.operation,
        event.field,
        event.normalizedValue,
      );
      target.invalidFields.delete(event.field);
    } else {
      target.invalidFields.set(event.field, event.error);
    }
  }

  const operations = [...working.values()].map((target): ProjectedOperation => {
    const issues = [...target.invalidFields.values()];
    if (target.operation.deadlineDate < target.operation.knownDate) {
      issues.push({
        code: 'DATE_ORDER_INVALID',
        message: 'data limite anterior à data conhecida',
        operationId: target.operation.operationId,
        field: 'deadlineDate',
      });
    }
    return {
      ...target.base,
      operation: target.operation,
      audit: { edits: target.edits },
      excluded: excluded.has(target.operation.operationId),
      executable: issues.length === 0,
      issues,
    };
  });
  return {
    operations,
    excludedOperationIds: [...excluded],
  };
}

export function projectPortfolio(study: ImportStudy): PortfolioProjection {
  const versions = collectVersions(study);
  const versionsById = new Map<string, PortfolioVersion[]>();
  for (const version of versions) {
    const id = version.operation.operationId;
    const candidates = versionsById.get(id) ?? [];
    candidates.push(version);
    versionsById.set(id, candidates);
  }
  const versionsByOperationId = Object.create(null) as Record<
    string,
    PortfolioVersion[]
  >;
  for (const [operationId, candidates] of versionsById) {
    versionsByOperationId[operationId] = candidates;
  }

  const resolutions = latestResolutions(study);
  const currentOperations: PortfolioOperation[] = [];
  const conflicts: PortfolioProjection['conflicts'] = [];

  for (const [operationId, candidates] of versionsById) {
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

  const projected = projectedOperations(study, currentOperations);

  return {
    versions,
    versionsByOperationId,
    currentOperations,
    operations: projected.operations,
    excludedOperationIds: projected.excludedOperationIds,
    conflicts,
    counts: {
      versions: versions.length,
      currentOperations: currentOperations.length,
      conflicts: conflicts.length,
      invalidRows: study.batches.reduce(
        (total, batch) => total + batch.rows.filter((row) => row.normalized === null).length,
        0,
      ),
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

function normalizeEdit(
  operationId: string,
  field: EditableField,
  rawValue: string,
): { normalizedValue: string | null; error: ImportIssue | null } {
  try {
    let normalizedValue: string | null;
    switch (field) {
      case 'direction':
        normalizedValue = normalizeDirection(rawValue);
        break;
      case 'knownDate':
      case 'deadlineDate':
        normalizedValue = parseCivilDate(rawValue);
        break;
      case 'valueBrl':
        normalizedValue = parseBrlDecimal(rawValue);
        break;
      case 'purposeCode':
        normalizedValue = normalizePurposeCode(rawValue);
        break;
    }
    return { normalizedValue, error: null };
  } catch (caught: unknown) {
    if (!(caught instanceof ImportValidationError)) {
      throw caught;
    }
    return {
      normalizedValue: null,
      error: {
        code: caught.code,
        message: caught.message,
        operationId,
        field,
      },
    };
  }
}

function ensureUniqueEventId(study: ImportStudy, eventId: string): void {
  if (study.events.some((event) => event.id === eventId)) {
    fail('EVENT_ID_ALREADY_EXISTS', `evento repetido ${eventId}`);
  }
}

export function editOperation(
  study: ImportStudy,
  command: {
    operationId: string;
    field: EditableField;
    rawValue: string;
    eventId: string;
    at: string;
  },
): ImportStudy {
  const projection = projectPortfolio(study);
  if (!projection.operations.some(
    (operation) => operation.operationId === command.operationId,
  )) {
    return fail(
      'OPERATION_NOT_EDITABLE',
      `operação ${command.operationId} não está vigente ou resolvida`,
    );
  }
  ensureUniqueEventId(study, command.eventId);
  const normalized = normalizeEdit(
    command.operationId,
    command.field,
    command.rawValue,
  );
  return appendEvent(study, {
    kind: 'OPERATION_EDITED',
    id: command.eventId,
    eventSequence: nextEventSequence(study),
    occurredAtUtc: command.at,
    operationId: command.operationId,
    field: command.field,
    rawValue: command.rawValue,
    ...normalized,
  }, command.at);
}

type InclusionCommand = {
  operationId: string;
  eventId: string;
  at: string;
};

function changeOperationInclusion(
  study: ImportStudy,
  command: InclusionCommand,
  kind: 'OPERATION_EXCLUDED' | 'OPERATION_RESTORED',
): ImportStudy {
  const projection = projectPortfolio(study);
  if (projection.versionsByOperationId[command.operationId] === undefined) {
    return fail(
      'OPERATION_NOT_FOUND',
      `operação ${command.operationId} não existe`,
    );
  }
  ensureUniqueEventId(study, command.eventId);
  return appendEvent(study, {
    kind,
    id: command.eventId,
    eventSequence: nextEventSequence(study),
    occurredAtUtc: command.at,
    operationId: command.operationId,
  }, command.at);
}

export function excludeOperation(
  study: ImportStudy,
  command: InclusionCommand,
): ImportStudy {
  return changeOperationInclusion(study, command, 'OPERATION_EXCLUDED');
}

export function restoreOperation(
  study: ImportStudy,
  command: InclusionCommand,
): ImportStudy {
  return changeOperationInclusion(study, command, 'OPERATION_RESTORED');
}
