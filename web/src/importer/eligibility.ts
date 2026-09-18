import { daysBetween } from './dates';
import type {
  ExecutionAssessment,
  ImportCatalog,
  ImportIssue,
  ISODate,
  PortfolioProjection,
  ProjectedOperation,
} from './domain';

type ExecutionRecut = {
  start: ISODate | null;
  end: ISODate | null;
};

function issue(
  code: ImportIssue['code'],
  message: string,
  operationId: string | null = null,
  field: ImportIssue['field'] = null,
): ImportIssue {
  return { code, message, operationId, field };
}

function effectiveRecut(
  operations: readonly ProjectedOperation[],
  recut: ExecutionRecut,
): { start: ISODate | null; end: ISODate | null } {
  const dates = operations.map((operation) => operation.operation.knownDate);
  return {
    start: recut.start ?? (dates.length > 0 ? [...dates].sort()[0] ?? null : null),
    end: recut.end ?? (dates.length > 0 ? [...dates].sort().at(-1) ?? null : null),
  };
}

function purposeIssue(
  operation: ProjectedOperation,
  catalog: ImportCatalog | null,
): ImportIssue | null {
  if (catalog === null || catalog.status === 'NAO_CONFIGURADO') {
    return issue(
      'CATALOG_NOT_CONFIGURED',
      'catálogo de finalidades não configurado',
      operation.operationId,
      'purposeCode',
    );
  }
  const code = operation.operation.purposeCode;
  if (code === null) {
    return issue(
      'PURPOSE_MISSING',
      'finalidade não informada',
      operation.operationId,
      'purposeCode',
    );
  }
  const purpose = catalog.purposes.find((candidate) => candidate.code === code);
  if (purpose === undefined) {
    return issue(
      'PURPOSE_UNKNOWN',
      `finalidade desconhecida ${code}`,
      operation.operationId,
      'purposeCode',
    );
  }
  if (!purpose.directions.includes(operation.operation.direction)) {
    return issue(
      'PURPOSE_DIRECTION_INVALID',
      'finalidade incompatível com a direção',
      operation.operationId,
      'purposeCode',
    );
  }
  return null;
}

function operationIssues(
  operation: ProjectedOperation,
  catalog: ImportCatalog | null,
): ImportIssue[] {
  const issues = [...operation.issues];
  const purpose = purposeIssue(operation, catalog);
  if (purpose !== null) {
    issues.push(purpose);
  }
  const deadlineDays = daysBetween(
    operation.operation.knownDate,
    operation.operation.deadlineDate,
  );
  if (deadlineDays < 0 || deadlineDays > 730) {
    issues.push(issue(
      'DEADLINE_OUT_OF_RANGE',
      'deadline fora do intervalo permitido',
      operation.operationId,
      'deadlineDate',
    ));
  }
  return issues;
}

function supersededCount(projection: PortfolioProjection): number {
  const currentOrigins = projection.operations.reduce(
    (total, operation) => total + operation.originVersionIds.length,
    0,
  );
  const unresolvedVersions = projection.conflicts.reduce(
    (total, conflict) => total + conflict.versionIds.length,
    0,
  );
  return Math.max(
    0,
    projection.versions.length - currentOrigins - unresolvedVersions,
  );
}

export function evaluateExecution(
  projection: PortfolioProjection,
  recut: ExecutionRecut,
  catalog: ImportCatalog | null,
): ExecutionAssessment {
  const blockers: ImportIssue[] = [];
  const issues: ImportIssue[] = [];
  const effective = effectiveRecut(projection.operations, recut);
  let periodDays = 0;

  if (effective.start !== null && effective.end !== null) {
    if (effective.start > effective.end) {
      blockers.push(issue('RECUT_INVERTED', 'recorte inicial após o final'));
    } else {
      periodDays = daysBetween(effective.start, effective.end) + 1;
      if (periodDays > 730) {
        blockers.push(issue('RECUT_TOO_LONG', 'recorte excede 730 dias'));
      }
    }
  }

  const excludedIds = new Set(projection.excludedOperationIds);
  for (const conflict of projection.conflicts) {
    if (!excludedIds.has(conflict.operationId)) {
      blockers.push(issue(
        'UNRESOLVED_CONFLICT',
        `conflito não resolvido em ${conflict.operationId}`,
        conflict.operationId,
      ));
    }
  }

  let outsideRecut = 0;
  let invalid = 0;
  const excluded = projection.excludedOperationIds.filter(
    (operationId) => projection.versionsByOperationId[operationId] !== undefined,
  ).length;
  const selected: ProjectedOperation[] = [];
  const recutValid = !blockers.some(
    (blocker) => blocker.code === 'RECUT_INVERTED'
      || blocker.code === 'RECUT_TOO_LONG',
  );

  for (const operation of projection.operations) {
    if (operation.excluded) {
      continue;
    }
    if (
      !recutValid
      || effective.start === null
      || effective.end === null
      || operation.operation.knownDate < effective.start
      || operation.operation.knownDate > effective.end
    ) {
      outsideRecut += 1;
      continue;
    }
    const found = operationIssues(operation, catalog);
    if (found.length > 0) {
      invalid += 1;
      issues.push(...found);
      continue;
    }
    selected.push(operation);
  }

  if (selected.length === 0) {
    blockers.push(issue(
      'ZERO_EXECUTABLE_OPERATIONS',
      'nenhuma operação executável foi selecionada',
    ));
  } else if (selected.length > 1000) {
    blockers.push(issue(
      'EXECUTION_LIMIT_EXCEEDED',
      'mais de 1.000 operações selecionadas',
    ));
  }

  return {
    selected,
    blockers,
    issues,
    omitted: {
      outsideRecut,
      invalid,
      excluded,
      superseded: supersededCount(projection),
    },
    requiresPartialConfirmation: selected.length > 0 && invalid > 0,
    periodDays,
  };
}
