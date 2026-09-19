import type { CompanyRecord, ObservedCase } from '../cases/domain';
import { validateObservedCase } from '../cases/validation';
import { canonical } from '../study/fingerprints';
import type { ExecutionRecord, StudyDocument } from '../study/model';
import { validateStudyDocument } from '../study/validation';
import type {
  ApplicationRepository,
  CASMutation,
  ConfirmObservedCaseMutation,
} from './applicationRepository';
import {
  BinaryDataNotAllowedError,
  InvalidDocumentError,
  NotFoundError,
  OperationConflictError,
  OwnerMismatchError,
  RevisionConflictError,
  SchemaUnsupportedError,
  StorageClosedError,
} from './errors';
import {
  migrateDatabase,
  type MigrationOptions,
  validateStoredStudy,
} from './migrations';

const DATABASE_VERSION = 1;

const STORE_NAMES = [
  'companies',
  'observed_cases',
  'import_batches',
  'import_events',
  'studies',
  'executions',
  'operations',
  'meta',
] as const;

type Scope = Readonly<{
  projectRef: string;
  ownerSub: string;
  migrationSources?: Omit<MigrationOptions, 'ownerSub'>;
  migrationSourceLoader?: () => Promise<Omit<MigrationOptions, 'ownerSub'>>;
}>;

type CompanyRow = Readonly<{
  company_id: string;
  owner_sub: string;
  display_name: string;
  document: CompanyRecord;
}>;

type ObservedCaseRow = Readonly<{
  case_id: string;
  owner_sub: string;
  company_id: string;
  document: ObservedCase;
}>;

type ImportBatchRow = Readonly<{
  case_id: string;
  batch_sequence: number;
  owner_sub: string;
  company_id: string;
  document: ConfirmObservedCaseMutation['batches'][number];
}>;

type ImportEventRow = Readonly<{
  case_id: string;
  event_sequence: number;
  owner_sub: string;
  company_id: string;
  document: ConfirmObservedCaseMutation['events'][number];
}>;

type ObservedCaseOperationRow = Readonly<{
  operation_id: string;
  owner_sub: string;
  entity_kind: 'observed_case';
  entity_id: string;
  intent: string;
  result_document: ObservedCase;
}>;

type StudyOperationRow = Readonly<{
  operation_id: string;
  owner_sub: string;
  entity_kind: 'study' | 'restore_study';
  entity_id: string;
  intent: string;
  result_document: Omit<StudyDocument, 'executions'>;
  result_execution_ids: readonly string[];
}>;

type PurgedOperationRow = Readonly<{
  operation_id: string;
  owner_sub: string;
  entity_kind: 'purged';
}>;

type OperationRow = ObservedCaseOperationRow | StudyOperationRow | PurgedOperationRow;

type StudyRow = Readonly<{
  study_id: string;
  owner_sub: string;
  deleted: 0 | 1;
  document: Omit<StudyDocument, 'executions'>;
}>;

type ExecutionRow = Readonly<{
  study_id: string;
  execution_id: string;
  owner_sub: string;
  sequence: number;
  document: ExecutionRecord;
}>;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function transactionResult<T>(
  database: IDBDatabase,
  stores: readonly string[],
  mode: IDBTransactionMode,
  work: (transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const transaction = database.transaction(stores, mode);
  let result: T;
  let failure: unknown;
  const completion = new Promise<T>((resolve, reject) => {
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Transação abortada.'));
    transaction.onerror = () => undefined;
  });
  try {
    result = await work(transaction);
  } catch (error) {
    failure = error;
    try {
      transaction.abort();
    } catch {
      // A request error may already have started the abort.
    }
  }
  return completion;
}

function rejectBinary(value: unknown, seen = new Set<object>()): void {
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    throw new BinaryDataNotAllowedError();
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Map) {
    for (const [key, child] of value) {
      rejectBinary(key, seen);
      rejectBinary(child, seen);
    }
  } else if (value instanceof Set) {
    for (const child of value) rejectBinary(child, seen);
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) {
      rejectBinary(descriptor.value, seen);
    }
  }
}

function validateMutation(expectedRevision: number, operationId: string): void {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || operationId.length === 0) {
    throw new InvalidDocumentError('Metadados da mutação inválidos.');
  }
}

function sameDocument(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function isInterruptionTransition(
  previous: ExecutionRecord,
  candidate: ExecutionRecord,
): boolean {
  if ((previous.status !== 'PREPARING' && previous.status !== 'RUNNING')
    || candidate.status !== 'INTERRUPTED'
    || previous.finishedAt !== null
    || candidate.finishedAt === null) return false;
  return sameDocument(
    { ...candidate, status: previous.status, finishedAt: previous.finishedAt },
    previous,
  );
}

function studyRow(document: StudyDocument): StudyRow {
  const cloned = structuredClone(document);
  const { executions, ...withoutExecutions } = cloned;
  void executions;
  return {
    study_id: document.id,
    owner_sub: document.ownerSub,
    deleted: document.deletedAt === null ? 0 : 1,
    document: withoutExecutions,
  };
}

function assembleStudy(row: StudyRow, executions: readonly ExecutionRow[]): StudyDocument {
  return {
    ...structuredClone(row.document),
    executions: [...executions]
      .sort((left, right) => left.sequence - right.sequence)
      .map((execution) => structuredClone(execution.document)),
  };
}

function assembleOperationStudy(
  operation: StudyOperationRow,
  executions: readonly ExecutionRow[],
): StudyDocument {
  const byId = new Map(executions.map((execution) => [execution.execution_id, execution.document]));
  return {
    ...structuredClone(operation.result_document),
    executions: operation.result_execution_ids.map((id) => {
      const execution = byId.get(id);
      if (execution === undefined) {
        throw new InvalidDocumentError('Execução referenciada pela operação está ausente.');
      }
      return structuredClone(execution);
    }),
  };
}

function createSchema(database: IDBDatabase): void {
  const companies = database.createObjectStore('companies', { keyPath: 'company_id' });
  companies.createIndex('by_owner', 'owner_sub');
  companies.createIndex('by_owner_display_name', ['owner_sub', 'display_name']);

  const cases = database.createObjectStore('observed_cases', { keyPath: 'case_id' });
  cases.createIndex('by_owner', 'owner_sub');
  cases.createIndex('by_owner_company', ['owner_sub', 'company_id']);

  const batches = database.createObjectStore('import_batches', {
    keyPath: ['case_id', 'batch_sequence'],
  });
  batches.createIndex('by_owner', 'owner_sub');
  batches.createIndex('by_owner_company', ['owner_sub', 'company_id']);
  batches.createIndex('by_owner_case', ['owner_sub', 'case_id']);

  const events = database.createObjectStore('import_events', {
    keyPath: ['case_id', 'event_sequence'],
  });
  events.createIndex('by_owner', 'owner_sub');
  events.createIndex('by_owner_company', ['owner_sub', 'company_id']);
  events.createIndex('by_owner_case', ['owner_sub', 'case_id']);

  const studies = database.createObjectStore('studies', { keyPath: 'study_id' });
  studies.createIndex('by_owner', 'owner_sub');
  studies.createIndex('by_owner_deleted', ['owner_sub', 'deleted']);

  const executions = database.createObjectStore('executions', {
    keyPath: ['study_id', 'execution_id'],
  });
  executions.createIndex('by_owner', 'owner_sub');
  executions.createIndex('by_owner_study', ['owner_sub', 'study_id']);

  const operations = database.createObjectStore('operations', { keyPath: 'operation_id' });
  operations.createIndex('by_owner', 'owner_sub');
  operations.createIndex('by_owner_entity', ['owner_sub', 'entity_kind', 'entity_id']);

  const meta = database.createObjectStore('meta', { keyPath: 'key' });
  meta.add({ key: 'schema_version', value: DATABASE_VERSION });
}

export class IndexedDbApplicationRepository implements ApplicationRepository {
  readonly #databaseName: string;
  readonly #ownerSub: string;
  readonly #migrationSources: Omit<MigrationOptions, 'ownerSub'>;
  readonly #migrationSourceLoader: Scope['migrationSourceLoader'];
  #databasePromise: Promise<IDBDatabase> | null = null;
  #closed = false;

  constructor(scope: Scope) {
    this.#databaseName = `motor-fluxo:app:v2:${encodeURIComponent(scope.projectRef)}:${encodeURIComponent(scope.ownerSub)}`;
    this.#ownerSub = scope.ownerSub;
    this.#migrationSources = scope.migrationSources ?? {};
    this.#migrationSourceLoader = scope.migrationSourceLoader;
  }

  async #database(): Promise<IDBDatabase> {
    if (this.#closed) throw new StorageClosedError();
    if (this.#databasePromise === null) {
      this.#databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.#databaseName, DATABASE_VERSION);
        request.onerror = () => {
          const error = request.error;
          this.#databasePromise = null;
          reject(error?.name === 'VersionError'
            ? new SchemaUnsupportedError('Versão física futura do banco local.')
            : error);
        };
        request.onupgradeneeded = () => createSchema(request.result);
        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => {
            database.close();
            this.#closed = true;
          };
          void Promise.resolve(this.#migrationSourceLoader?.() ?? this.#migrationSources)
            .then((migrationSources) => migrateDatabase(database, {
              ownerSub: this.#ownerSub,
              ...migrationSources,
            })).then(
            () => resolve(database),
            (error: unknown) => {
              database.close();
              this.#databasePromise = null;
              reject(error);
            },
          );
        };
      });
    }
    return this.#databasePromise;
  }

  async listCompanies(): Promise<CompanyRecord[]> {
    const database = await this.#database();
    const transaction = database.transaction('companies', 'readonly');
    const rows = await requestResult<CompanyRow[]>(
      transaction.objectStore('companies').index('by_owner').getAll(this.#ownerSub),
    );
    return rows.map((row) => structuredClone(row.document));
  }

  async listObservedCases(companyId?: string): Promise<ObservedCase[]> {
    const database = await this.#database();
    const transaction = database.transaction('observed_cases', 'readonly');
    const index = transaction.objectStore('observed_cases')
      .index(companyId === undefined ? 'by_owner' : 'by_owner_company');
    const key = companyId === undefined ? this.#ownerSub : [this.#ownerSub, companyId];
    const rows = await requestResult<ObservedCaseRow[]>(index.getAll(key));
    return rows
      .map((row) => structuredClone(row.document))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async getObservedCase(id: string): Promise<ObservedCase | null> {
    const database = await this.#database();
    const transaction = database.transaction('observed_cases', 'readonly');
    const row = await requestResult<ObservedCaseRow | undefined>(
      transaction.objectStore('observed_cases').get(id),
    );
    return row?.owner_sub === this.#ownerSub ? structuredClone(row.document) : null;
  }

  async confirmObservedCase(input: ConfirmObservedCaseMutation): Promise<ObservedCase> {
    rejectBinary(input);
    validateMutation(input.expectedRevision, input.operationId);
    const validation = validateObservedCase(input.observedCase);
    if (!validation.ok) {
      throw new InvalidDocumentError(validation.issues[0]?.message ?? 'Caso observado inválido.');
    }
    const { company, observedCase, batches, events } = input;
    if (company.ownerSub !== this.#ownerSub || observedCase.ownerSub !== this.#ownerSub) {
      throw new OwnerMismatchError();
    }
    if (company.id !== observedCase.companyId
      || observedCase.revision !== input.expectedRevision + 1
      || !Number.isSafeInteger(company.revision)
      || company.revision < 1) {
      throw new InvalidDocumentError('Empresa, caso ou revisão incompatível.');
    }
    for (const batch of batches) {
      if (batch.ownerSub !== this.#ownerSub) throw new OwnerMismatchError();
      if (batch.caseId !== observedCase.id || batch.companyId !== company.id
        || !Number.isSafeInteger(batch.batchSequence) || batch.batchSequence < 0) {
        throw new InvalidDocumentError('Lote de importação incompatível.');
      }
    }
    for (const event of events) {
      if (event.ownerSub !== this.#ownerSub) throw new OwnerMismatchError();
      if (event.caseId !== observedCase.id || event.companyId !== company.id
        || !Number.isSafeInteger(event.eventSequence) || event.eventSequence < 0) {
        throw new InvalidDocumentError('Evento de importação incompatível.');
      }
    }

    const database = await this.#database();
    const intent = canonical(input);
    const result = await transactionResult(
      database,
      ['companies', 'observed_cases', 'import_batches', 'import_events', 'operations'],
      'readwrite',
      async (transaction) => {
        const operationStore = transaction.objectStore('operations');
        const previousOperation = await requestResult<OperationRow | undefined>(
          operationStore.get(input.operationId),
        );
        if (previousOperation !== undefined) {
          if (previousOperation.owner_sub !== this.#ownerSub
            || previousOperation.entity_kind !== 'observed_case'
            || previousOperation.entity_id !== observedCase.id
            || previousOperation.intent !== intent) {
            throw new OperationConflictError();
          }
          return structuredClone(previousOperation.result_document);
        }

        const caseStore = transaction.objectStore('observed_cases');
        const current = await requestResult<ObservedCaseRow | undefined>(caseStore.get(observedCase.id));
        const actualRevision = current?.document.revision ?? 0;
        if (current !== undefined && current.owner_sub !== this.#ownerSub) {
          throw new OwnerMismatchError();
        }
        if (actualRevision !== input.expectedRevision) {
          throw new RevisionConflictError(input.expectedRevision, actualRevision);
        }

        const batchStore = transaction.objectStore('import_batches');
        for (const batch of batches) {
          const existing = await requestResult<ImportBatchRow | undefined>(
            batchStore.get([batch.caseId, batch.batchSequence]),
          );
          if (existing !== undefined && !sameDocument(existing.document, batch)) {
            throw new OperationConflictError('Lote imutável já possui outro conteúdo.');
          }
          if (existing === undefined) batchStore.add({
            case_id: batch.caseId,
            batch_sequence: batch.batchSequence,
            owner_sub: batch.ownerSub,
            company_id: batch.companyId,
            document: structuredClone(batch),
          } satisfies ImportBatchRow);
        }

        const eventStore = transaction.objectStore('import_events');
        for (const event of events) {
          const existing = await requestResult<ImportEventRow | undefined>(
            eventStore.get([event.caseId, event.eventSequence]),
          );
          if (existing !== undefined && !sameDocument(existing.document, event)) {
            throw new OperationConflictError('Evento imutável já possui outro conteúdo.');
          }
          if (existing === undefined) eventStore.add({
            case_id: event.caseId,
            event_sequence: event.eventSequence,
            owner_sub: event.ownerSub,
            company_id: event.companyId,
            document: structuredClone(event),
          } satisfies ImportEventRow);
        }

        transaction.objectStore('companies').put({
          company_id: company.id,
          owner_sub: company.ownerSub,
          display_name: company.displayName,
          document: structuredClone(company),
        } satisfies CompanyRow);
        caseStore.put({
          case_id: observedCase.id,
          owner_sub: observedCase.ownerSub,
          company_id: observedCase.companyId,
          document: structuredClone(observedCase),
        } satisfies ObservedCaseRow);
        operationStore.add({
          operation_id: input.operationId,
          owner_sub: this.#ownerSub,
          entity_kind: 'observed_case',
          entity_id: observedCase.id,
          intent,
          result_document: structuredClone(observedCase),
        } satisfies ObservedCaseOperationRow);
        return structuredClone(observedCase);
      },
    );
    return result;
  }

  async listStudies(options?: { includeDeleted?: boolean }): Promise<StudyDocument[]> {
    const database = await this.#database();
    const transaction = database.transaction(['studies', 'executions'], 'readonly');
    const studyRequest = options?.includeDeleted === true
      ? transaction.objectStore('studies').index('by_owner').getAll(this.#ownerSub)
      : transaction.objectStore('studies').index('by_owner_deleted')
        .getAll([this.#ownerSub, 0]);
    const executionRequest = transaction.objectStore('executions')
      .index('by_owner').getAll(this.#ownerSub);
    const [rows, executions] = await Promise.all([
      requestResult<StudyRow[]>(studyRequest),
      requestResult<ExecutionRow[]>(executionRequest),
    ]);
    const studies = rows
      .map((row) => assembleStudy(
        row,
        executions.filter((execution) => execution.study_id === row.study_id),
      ))
      .sort((left, right) => left.id.localeCompare(right.id));
    return Promise.all(studies.map((study) => validateStoredStudy(study, this.#ownerSub)));
  }

  async getStudy(id: string): Promise<StudyDocument | null> {
    const database = await this.#database();
    const transaction = database.transaction(['studies', 'executions'], 'readonly');
    const [row, executions] = await Promise.all([
      requestResult<StudyRow | undefined>(transaction.objectStore('studies').get(id)),
      requestResult<ExecutionRow[]>(transaction.objectStore('executions')
        .index('by_owner_study').getAll([this.#ownerSub, id])),
    ]);
    return row?.owner_sub === this.#ownerSub
      ? validateStoredStudy(assembleStudy(row, executions), this.#ownerSub)
      : null;
  }

  async saveStudy(input: CASMutation<StudyDocument>): Promise<StudyDocument> {
    rejectBinary(input);
    validateMutation(input.expectedRevision, input.operationId);
    const validation = await validateStudyDocument(input.document, this.#ownerSub);
    if (!validation.ok) {
      if (validation.issues.some((issue) => issue.code === 'OWNER_MISMATCH')) {
        throw new OwnerMismatchError();
      }
      throw new InvalidDocumentError(validation.issues[0]?.message ?? 'Estudo inválido.');
    }
    if (input.document.revision !== input.expectedRevision + 1) {
      throw new InvalidDocumentError('A revisão do documento não sucede expectedRevision.');
    }

    const database = await this.#database();
    const intent = canonical(input);
    const result = await transactionResult(
      database,
      ['studies', 'executions', 'operations'],
      'readwrite',
      async (transaction) => {
        const operationStore = transaction.objectStore('operations');
        const previousOperation = await requestResult<OperationRow | undefined>(
          operationStore.get(input.operationId),
        );
        if (previousOperation !== undefined) {
          if (previousOperation.owner_sub !== this.#ownerSub
            || previousOperation.entity_kind !== 'study'
            || previousOperation.entity_id !== input.document.id
            || previousOperation.intent !== intent) {
            throw new OperationConflictError();
          }
          const storedExecutions = await requestResult<ExecutionRow[]>(
            transaction.objectStore('executions').index('by_owner_study')
              .getAll([this.#ownerSub, input.document.id]),
          );
          return assembleOperationStudy(previousOperation, storedExecutions);
        }

        const studies = transaction.objectStore('studies');
        const executions = transaction.objectStore('executions');
        const [current, existingExecutions] = await Promise.all([
          requestResult<StudyRow | undefined>(studies.get(input.document.id)),
          requestResult<ExecutionRow[]>(executions.index('by_owner_study')
            .getAll([this.#ownerSub, input.document.id])),
        ]);
        if (current !== undefined && current.owner_sub !== this.#ownerSub) {
          throw new OwnerMismatchError();
        }
        const actualRevision = current?.document.revision ?? 0;
        if (actualRevision !== input.expectedRevision) {
          throw new RevisionConflictError(input.expectedRevision, actualRevision);
        }

        const existingById = new Map(
          existingExecutions.map((execution) => [execution.execution_id, execution]),
        );
        for (const existing of existingExecutions) {
          const candidate = input.document.executions[existing.sequence];
          if (candidate === undefined
            || candidate.id !== existing.execution_id
            || (!sameDocument(candidate, existing.document)
              && !isInterruptionTransition(existing.document, candidate))) {
            throw new OperationConflictError('Execução persistida é imutável.');
          }
        }
        for (const [sequence, execution] of input.document.executions.entries()) {
          const existing = existingById.get(execution.id);
          if (existing === undefined) {
            executions.add({
              study_id: input.document.id,
              execution_id: execution.id,
              owner_sub: this.#ownerSub,
              sequence,
              document: structuredClone(execution),
            } satisfies ExecutionRow);
          } else if (isInterruptionTransition(existing.document, execution)) {
            executions.put({
              ...existing,
              document: structuredClone(execution),
            } satisfies ExecutionRow);
          }
        }

        const storedStudy = studyRow(input.document);
        studies.put(storedStudy);
        operationStore.add({
          operation_id: input.operationId,
          owner_sub: this.#ownerSub,
          entity_kind: 'study',
          entity_id: input.document.id,
          intent,
          result_document: storedStudy.document,
          result_execution_ids: input.document.executions.map((execution) => execution.id),
        } satisfies StudyOperationRow);
        return structuredClone(input.document);
      },
    );
    return validateStoredStudy(result, this.#ownerSub);
  }

  async restoreStudy(
    id: string,
    expectedRevision: number,
    operationId: string,
  ): Promise<StudyDocument> {
    validateMutation(expectedRevision, operationId);
    const database = await this.#database();
    const intent = canonical({ action: 'restoreStudy', id, expectedRevision });
    const result = await transactionResult(
      database,
      ['studies', 'executions', 'operations'],
      'readwrite',
      async (transaction) => {
        const operationStore = transaction.objectStore('operations');
        const previousOperation = await requestResult<OperationRow | undefined>(
          operationStore.get(operationId),
        );
        if (previousOperation !== undefined) {
          if (previousOperation.owner_sub !== this.#ownerSub
            || previousOperation.entity_kind !== 'restore_study'
            || previousOperation.entity_id !== id
            || previousOperation.intent !== intent) {
            throw new OperationConflictError();
          }
          const storedExecutions = await requestResult<ExecutionRow[]>(
            transaction.objectStore('executions').index('by_owner_study')
              .getAll([this.#ownerSub, id]),
          );
          return assembleOperationStudy(previousOperation, storedExecutions);
        }

        const studies = transaction.objectStore('studies');
        const [row, executions] = await Promise.all([
          requestResult<StudyRow | undefined>(studies.get(id)),
          requestResult<ExecutionRow[]>(transaction.objectStore('executions')
            .index('by_owner_study').getAll([this.#ownerSub, id])),
        ]);
        if (row === undefined || row.owner_sub !== this.#ownerSub) {
          throw new NotFoundError('Estudo não encontrado.');
        }
        const current = assembleStudy(row, executions);
        if (current.revision !== expectedRevision) {
          throw new RevisionConflictError(expectedRevision, current.revision);
        }
        const restored: StudyDocument = {
          ...current,
          revision: current.revision + 1,
          deletedAt: null,
        };
        const storedStudy = studyRow(restored);
        studies.put(storedStudy);
        operationStore.add({
          operation_id: operationId,
          owner_sub: this.#ownerSub,
          entity_kind: 'restore_study',
          entity_id: id,
          intent,
          result_document: storedStudy.document,
          result_execution_ids: restored.executions.map((execution) => execution.id),
        } satisfies StudyOperationRow);
        return structuredClone(restored);
      },
    );
    return validateStoredStudy(result, this.#ownerSub);
  }

  async purgeStudy(id: string): Promise<void> {
    const database = await this.#database();
    return transactionResult(
      database,
      ['studies', 'executions', 'operations'],
      'readwrite',
      async (transaction) => {
        const studies = transaction.objectStore('studies');
        const row = await requestResult<StudyRow | undefined>(studies.get(id));
        if (row === undefined || row.owner_sub !== this.#ownerSub) return;
        const executions = transaction.objectStore('executions');
        const operations = transaction.objectStore('operations');
        const [records, studyOperations, restoreOperations] = await Promise.all([
          requestResult<ExecutionRow[]>(
            executions.index('by_owner_study').getAll([this.#ownerSub, id]),
          ),
          requestResult<StudyOperationRow[]>(
            operations.index('by_owner_entity').getAll([this.#ownerSub, 'study', id]),
          ),
          requestResult<StudyOperationRow[]>(
            operations.index('by_owner_entity').getAll([this.#ownerSub, 'restore_study', id]),
          ),
        ]);
        for (const execution of records) {
          executions.delete([execution.study_id, execution.execution_id]);
        }
        for (const operation of [...studyOperations, ...restoreOperations]) {
          operations.put({
            operation_id: operation.operation_id,
            owner_sub: this.#ownerSub,
            entity_kind: 'purged',
          } satisfies PurgedOperationRow);
        }
        studies.delete(id);
      },
    );
  }

  close(): void {
    this.#closed = true;
    void this.#databasePromise?.then(
      (database) => database.close(),
      () => undefined,
    );
  }
}

export { STORE_NAMES };
