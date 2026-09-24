import type { CompanyRecord, ObservedCase } from '../cases/domain';
import { validateObservedCase } from '../cases/validation';
import { materializeDemoPackage, snapshotDemoPackage } from '../demo/materializeDemoPackage';
import type { OperationalProfileVersion } from '../profiles/domain';
import { validateOperationalProfile } from '../profiles/validation';
import { canonical } from '../study/fingerprints';
import type { ExecutionRecordV3, StudyDocument } from '../study/model';
import { parseStudyV3, validateStudyDocument } from '../study/validation';
import type {
  ApplicationRepository,
  AppendProfileVersionMutation,
  CASMutation,
  ConfirmObservedCaseMutation,
  DemoInstallMutation,
} from './applicationRepository';
import {
  InvalidDocumentError,
  DemoInstallSkippedError,
  DocumentCorruptError,
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
import { rejectBinary } from './rejectBinary';
import { validateImportRecords } from './importRecords';
import { IndexedDbChatRepository } from '../chat/repository';
import type { ChatConversation } from '../chat/domain';

const DATABASE_VERSION = 3;

const STORE_NAMES = [
  'companies',
  'observed_cases',
  'import_batches',
  'import_events',
  'studies',
  'executions',
  'operations',
  'profile_versions',
  'meta',
  'chat_conversations',
  'chat_operations',
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

type ProfileVersionRow = Readonly<{
  profile_version_id: string;
  owner_sub: string;
  company_id: string;
  version: number;
  document: OperationalProfileVersion;
}>;

type ProfileVersionOperationRow = Readonly<{
  operation_id: string;
  owner_sub: string;
  entity_kind: 'profile_version';
  entity_id: string;
  intent: string;
  result_document: OperationalProfileVersion;
}>;

type StudyOperationRow = Readonly<{
  operation_id: string;
  owner_sub: string;
  entity_kind: 'study' | 'restore_study' | 'demo_install';
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

type OperationRow = ObservedCaseOperationRow | ProfileVersionOperationRow | StudyOperationRow | PurgedOperationRow;

type DemoMarker = Readonly<{
  status: 'INSTALLED' | 'REMOVED';
  ownerSub: string;
  studyId: string;
  packageVersion: string;
  packageDigest: string;
}>;
const DEMO_MARKER_KEY = 'demo:installation';
class DemoStateChangedError extends Error {}

function readDemoMarker(row: unknown, ownerSub: string): DemoMarker | null {
  if (row === undefined) return null;
  if (!isObject(row) || !isObject(row.value)) throw new DocumentCorruptError('Marcador da demonstração inválido.');
  const value = row.value;
  if ((value.status !== 'INSTALLED' && value.status !== 'REMOVED')
    || value.ownerSub !== ownerSub || typeof value.studyId !== 'string'
    || typeof value.packageVersion !== 'string' || typeof value.packageDigest !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.packageDigest)) {
    throw new DocumentCorruptError('Marcador da demonstração inválido.');
  }
  return value as DemoMarker;
}

async function digest(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

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
  document: ExecutionRecordV3;
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

function validateMutation(expectedRevision: number, operationId: string): void {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || operationId.length === 0) {
    throw new InvalidDocumentError('Metadados da mutação inválidos.');
  }
}

function sameDocument(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function isInterruptionTransition(
  previous: ExecutionRecordV3,
  candidate: ExecutionRecordV3,
): boolean {
  if (previous.kind !== 'PREVIEW' || candidate.kind !== 'PREVIEW') return false;
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

function createBaseStores(database: IDBDatabase): void {
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

  database.createObjectStore('meta', { keyPath: 'key' });
}

function createProfileStore(database: IDBDatabase): void {
  const profiles = database.createObjectStore('profile_versions', { keyPath: 'profile_version_id' });
  profiles.createIndex('by_owner', 'owner_sub');
  profiles.createIndex('by_owner_company', ['owner_sub', 'company_id']);
  profiles.createIndex(
    'by_owner_company_version',
    ['owner_sub', 'company_id', 'version'],
    { unique: true },
  );
}

function createChatStores(database: IDBDatabase): void {
  const conversations = database.createObjectStore('chat_conversations', { keyPath: 'conversation_id' });
  conversations.createIndex('by_owner', 'owner_sub');
  conversations.createIndex('by_owner_study', ['owner_sub', 'study_key']);
  conversations.createIndex('by_owner_study_updated', ['owner_sub', 'study_key', 'updated_at']);
  const operations = database.createObjectStore('chat_operations', { keyPath: 'operation_id' });
  operations.createIndex('by_owner', 'owner_sub');
  operations.createIndex('by_owner_conversation', ['owner_sub', 'conversation_id']);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function migrateStoredStudyPart(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new InvalidDocumentError('StudyDocument V2 persistido inválido.');
  if (value.schemaVersion !== '2.0.0') {
    if (typeof value.schemaVersion === 'string' && value.schemaVersion !== '3.0.0') {
      throw new SchemaUnsupportedError(`StudyDocument ${value.schemaVersion} não suportado.`);
    }
    throw new InvalidDocumentError('StudyDocument V2 persistido inválido.');
  }
  const migrated = structuredClone(value);
  migrated.schemaVersion = '3.0.0';
  migrated.evidenceSnapshots = [];
  return migrated;
}

function migrateStoredExecution(value: unknown): Record<string, unknown> {
  if (!isObject(value) || 'kind' in value) {
    throw new InvalidDocumentError('Execução PREVIEW V2 persistida inválida.');
  }
  return { ...structuredClone(value), kind: 'PREVIEW' };
}

function migrateStudyIntent(intent: unknown): string {
  if (typeof intent !== 'string') throw new InvalidDocumentError('Intent de estudo inválido.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(intent);
  } catch {
    throw new InvalidDocumentError('Intent de estudo inválido.');
  }
  if (!isObject(parsed) || !isObject(parsed.document)) {
    throw new InvalidDocumentError('Intent de estudo inválido.');
  }
  const document = migrateStoredStudyPart(parsed.document);
  if (!Array.isArray(parsed.document.executions)) {
    throw new InvalidDocumentError('Intent de estudo sem execuções.');
  }
  document.executions = parsed.document.executions.map(migrateStoredExecution);
  return canonical({ ...parsed, document });
}

const upgradeFailures = new WeakMap<IDBTransaction, unknown>();

function abortUpgrade(transaction: IDBTransaction, error: unknown): void {
  upgradeFailures.set(transaction, error);
  try {
    transaction.abort();
  } catch {
    // The failing request may already have aborted the transaction.
  }
}

function upgradeSchema(
  database: IDBDatabase,
  transaction: IDBTransaction,
  oldVersion: number,
): void {
  if (oldVersion === 0) {
    createBaseStores(database);
    createProfileStore(database);
    createChatStores(database);
    transaction.objectStore('meta').add({ key: 'schema_version', value: DATABASE_VERSION });
    return;
  }
  if (oldVersion === 2) {
    const marker = transaction.objectStore('meta').get('schema_version');
    marker.onsuccess = () => {
      try {
        if (marker.result?.value !== 2) {
          if (typeof marker.result?.value === 'number' && marker.result.value > DATABASE_VERSION) {
            throw new SchemaUnsupportedError();
          }
          throw new DocumentCorruptError('Marcador físico e lógico são incompatíveis.');
        }
        createChatStores(database);
        transaction.objectStore('meta').put({ key: 'schema_version', value: DATABASE_VERSION });
      } catch (error) {
        abortUpgrade(transaction, error);
      }
    };
    return;
  }
  if (oldVersion !== 1) {
    abortUpgrade(transaction, new SchemaUnsupportedError('Versão física futura do banco local.'));
    return;
  }

  createProfileStore(database);
  createChatStores(database);
  const fail = (error: unknown) => abortUpgrade(transaction, error);
  const studies = transaction.objectStore('studies');
  const executions = transaction.objectStore('executions');
  const operations = transaction.objectStore('operations');
  const studyRequest = studies.getAll();
  const executionRequest = executions.getAll();
  const operationRequest = operations.getAll();
  const metaRequest = transaction.objectStore('meta').get('schema_version');
  let studyRows: Array<Record<string, unknown>> | null = null;
  let executionRows: Array<Record<string, unknown>> | null = null;
  let operationRows: Array<Record<string, unknown>> | null = null;
  let schemaMarker: Record<string, unknown> | null = null;
  const migrate = () => {
    if (studyRows === null || executionRows === null || operationRows === null
      || schemaMarker === null) return;
    try {
      if (typeof schemaMarker.value !== 'number' || !Number.isSafeInteger(schemaMarker.value)) {
        throw new InvalidDocumentError('Marcador de schema local inválido.');
      }
      if (schemaMarker.value > DATABASE_VERSION) {
        throw new SchemaUnsupportedError(
          `Schema local ${String(schemaMarker.value)} é mais novo que o suportado.`,
        );
      }
      if (schemaMarker.value !== 1) {
        throw new InvalidDocumentError('Marcador físico e lógico são incompatíveis.');
      }
      const migratedExecutions: Array<Record<string, unknown>> = executionRows.map((row) => ({
        ...row,
        document: migrateStoredExecution(row.document),
      }));
      for (const row of studyRows) {
        const document = migrateStoredStudyPart(row.document);
        const matchingExecutions = migratedExecutions
          .filter((execution) => execution.study_id === row.study_id)
          .sort((left, right) => Number(left.sequence) - Number(right.sequence))
          .map((execution) => execution.document);
        parseStudyV3({ ...document, executions: matchingExecutions });
        studies.put({ ...row, document });
      }
      for (const row of migratedExecutions) executions.put(row);
      for (const row of operationRows) {
        if (row.entity_kind !== 'study' && row.entity_kind !== 'restore_study') continue;
        if (!Array.isArray(row.result_execution_ids)
          || row.result_execution_ids.some((id) => typeof id !== 'string')) {
          throw new InvalidDocumentError('Resultado idempotente possui execuções inválidas.');
        }
        const resultDocument = migrateStoredStudyPart(row.result_document);
        const resultExecutions = row.result_execution_ids.map((id) => {
          const execution = migratedExecutions.find((candidate) =>
            candidate.study_id === row.entity_id && candidate.execution_id === id);
          if (execution === undefined) {
            throw new InvalidDocumentError('Resultado idempotente referencia execução ausente.');
          }
          return execution.document;
        });
        parseStudyV3({ ...resultDocument, executions: resultExecutions });
        operations.put({
          ...row,
          ...(row.entity_kind === 'study' ? { intent: migrateStudyIntent(row.intent) } : {}),
          result_document: resultDocument,
          result_execution_ids: structuredClone(row.result_execution_ids),
        });
      }
      transaction.objectStore('meta').put({ key: 'schema_version', value: DATABASE_VERSION });
    } catch (error) {
      fail(error);
    }
  };
  studyRequest.onsuccess = () => {
    studyRows = studyRequest.result as Array<Record<string, unknown>>;
    migrate();
  };
  executionRequest.onsuccess = () => {
    executionRows = executionRequest.result as Array<Record<string, unknown>>;
    migrate();
  };
  operationRequest.onsuccess = () => {
    operationRows = operationRequest.result as Array<Record<string, unknown>>;
    migrate();
  };
  metaRequest.onsuccess = () => {
    schemaMarker = isObject(metaRequest.result) ? metaRequest.result : {};
    migrate();
  };
}

export class IndexedDbApplicationRepository implements ApplicationRepository {
  readonly #databaseName: string;
  readonly #ownerSub: string;
  readonly #migrationSources: Omit<MigrationOptions, 'ownerSub'>;
  readonly #migrationSourceLoader: Scope['migrationSourceLoader'];
  #databasePromise: Promise<IDBDatabase> | null = null;
  #closed = false;
  readonly #chat: IndexedDbChatRepository;

  constructor(scope: Scope) {
    this.#databaseName = `motor-fluxo:app:v2:${encodeURIComponent(scope.projectRef)}:${encodeURIComponent(scope.ownerSub)}`;
    this.#ownerSub = scope.ownerSub;
    this.#migrationSources = scope.migrationSources ?? {};
    this.#migrationSourceLoader = scope.migrationSourceLoader;
    this.#chat = new IndexedDbChatRepository(() => this.#database(), this.#ownerSub);
  }

  listChatConversations(studyId: string | null): Promise<ChatConversation[]> {
    return this.#chat.listChatConversations(studyId);
  }

  getChatConversation(id: string): Promise<ChatConversation | null> {
    return this.#chat.getChatConversation(id);
  }

  saveChatConversation(input: CASMutation<ChatConversation>): Promise<ChatConversation> {
    return this.#chat.saveChatConversation(input);
  }

  deleteChatConversation(id: string, expectedRevision: number, operationId: string): Promise<void> {
    return this.#chat.deleteChatConversation(id, expectedRevision, operationId);
  }

  async getDemoInstallationStatus(): Promise<'INSTALLED' | 'REMOVED' | null> {
    const database = await this.#database();
    const marker = await transactionResult(database, ['meta'], 'readonly', async (transaction) =>
      readDemoMarker(await requestResult(transaction.objectStore('meta').get(DEMO_MARKER_KEY)), this.#ownerSub));
    return marker?.status ?? null;
  }

  async #database(): Promise<IDBDatabase> {
    if (this.#closed) throw new StorageClosedError();
    if (this.#databasePromise === null) {
      this.#databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.#databaseName, DATABASE_VERSION);
        let upgradeTransaction: IDBTransaction | null = null;
        request.onerror = () => {
          const error = request.error;
          this.#databasePromise = null;
          reject(upgradeTransaction !== null && upgradeFailures.has(upgradeTransaction)
            ? upgradeFailures.get(upgradeTransaction)
            : error?.name === 'VersionError'
            ? new SchemaUnsupportedError('Versão física futura do banco local.')
            : error);
        };
        request.onupgradeneeded = (event) => {
          upgradeTransaction = request.transaction;
          if (upgradeTransaction === null) {
            request.result.close();
            reject(new InvalidDocumentError('Transação de upgrade ausente.'));
            return;
          }
          upgradeSchema(request.result, upgradeTransaction, event.oldVersion);
        };
        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => {
            database.close();
            this.#closed = true;
            this.#chat.close();
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

  /** Validate and materialize before opening the one transaction that publishes the package. */
  async installDemoStudy(candidate: DemoInstallMutation): Promise<StudyDocument> {
    rejectBinary(candidate);
    if (!isObject(candidate) || Reflect.ownKeys(candidate).length !== 3
      || Reflect.ownKeys(candidate).some((key) => typeof key !== 'string'
        || !['package', 'mode', 'operationId'].includes(key)
        || !('value' in Object.getOwnPropertyDescriptor(candidate, key)!))) {
      throw new InvalidDocumentError('Mutação da demonstração inválida.');
    }
    const input: DemoInstallMutation = {
      package: snapshotDemoPackage(candidate.package), mode: candidate.mode, operationId: candidate.operationId,
    };
    if ((input.mode !== 'FIRST_EMPTY_SESSION' && input.mode !== 'EXPLICIT_RESTORE')
      || typeof input.operationId !== 'string' || input.operationId.trim().length === 0) {
      throw new InvalidDocumentError('Mutação da demonstração inválida.');
    }
    const intent = await digest(input);
    const packageDigest = await digest(input.package);
    const installationId = await digest({ database: this.#databaseName, operationId: input.operationId });
    const materialized = await materializeDemoPackage(input.package, this.#ownerSub, installationId);
    const database = await this.#database();
    if (this.#closed) throw new StorageClosedError();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // Hash validation cannot run inside an IndexedDB transaction. Validate a
      // consistent read snapshot, then compare it again under the write lock.
      const preflight = await transactionResult(database, ['meta', 'studies', 'executions'], 'readonly', async (tx) => {
        const marker = readDemoMarker(await requestResult(tx.objectStore('meta').get(DEMO_MARKER_KEY)), this.#ownerSub);
        if (marker?.status !== 'INSTALLED') return { marker, document: null };
        const [row, records] = await Promise.all([
          requestResult<StudyRow | undefined>(tx.objectStore('studies').get(marker.studyId)),
          requestResult<ExecutionRow[]>(tx.objectStore('executions').index('by_owner_study').getAll([this.#ownerSub, marker.studyId])),
        ]);
        if (row === undefined || row.owner_sub !== this.#ownerSub) {
          throw new DocumentCorruptError('Estudo demonstrativo instalado está ausente.');
        }
        return { marker, document: assembleStudy(row, records) };
      });
      if (preflight.document !== null) await validateStoredStudy(preflight.document, this.#ownerSub);
      if (this.#closed) throw new StorageClosedError();
      try {
        const result = await transactionResult(database,
          ['companies', 'observed_cases', 'profile_versions', 'studies', 'executions', 'operations', 'meta'],
          'readwrite', async (transaction) => {
            const operations = transaction.objectStore('operations');
            const studies = transaction.objectStore('studies');
            const executions = transaction.objectStore('executions');
            const meta = transaction.objectStore('meta');
            const [previous, markerRow] = await Promise.all([
              requestResult<OperationRow | undefined>(operations.get(input.operationId)),
              requestResult<unknown>(meta.get(DEMO_MARKER_KEY)),
            ]);
            const marker = readDemoMarker(markerRow, this.#ownerSub);
            if (!sameDocument(marker, preflight.marker)) throw new DemoStateChangedError();
            if (marker?.status === 'INSTALLED') {
              const [row, records] = await Promise.all([
                requestResult<StudyRow | undefined>(studies.get(marker.studyId)),
                requestResult<ExecutionRow[]>(executions.index('by_owner_study').getAll([this.#ownerSub, marker.studyId])),
              ]);
              if (row === undefined || row.owner_sub !== this.#ownerSub
                || !sameDocument(assembleStudy(row, records), preflight.document)) throw new DemoStateChangedError();
            }
            if (previous !== undefined) {
              if (previous.owner_sub !== this.#ownerSub || previous.entity_kind !== 'demo_install'
                || previous.intent !== intent || marker?.status !== 'INSTALLED'
                || marker.studyId !== previous.entity_id) throw new OperationConflictError();
              const storedExecutions = await requestResult<ExecutionRow[]>(executions.index('by_owner_study')
                .getAll([this.#ownerSub, previous.entity_id]));
              return assembleOperationStudy(previous, storedExecutions);
            }
            if (input.mode === 'FIRST_EMPTY_SESSION') {
              const count = await requestResult(studies.index('by_owner').count(this.#ownerSub));
              if (marker !== null || count !== 0) throw new DemoInstallSkippedError();
            }
            let document = materialized.study;
            if (marker?.status === 'INSTALLED') {
              // Explicit restore keeps edits and evidence; a corrupt installation is never silently repaired.
              document = preflight.document!;
              if (document.deletedAt !== null) {
                document = { ...document, deletedAt: null, revision: document.revision + 1 };
                studies.put(studyRow(document));
              }
            } else {
              for (const company of materialized.companies) transaction.objectStore('companies').add({
                company_id: company.id, owner_sub: this.#ownerSub, display_name: company.displayName, document: company,
              } satisfies CompanyRow);
              for (const observedCase of materialized.observedCases) transaction.objectStore('observed_cases').add({
                case_id: observedCase.id, owner_sub: this.#ownerSub, company_id: observedCase.companyId, document: observedCase,
              } satisfies ObservedCaseRow);
              for (const profile of materialized.profiles) transaction.objectStore('profile_versions').add({
                profile_version_id: profile.id, owner_sub: this.#ownerSub, company_id: profile.companyId,
                version: profile.version, document: profile,
              } satisfies ProfileVersionRow);
              studies.add(studyRow(document));
              for (const [sequence, execution] of document.executions.entries()) executions.add({
                study_id: document.id, execution_id: execution.id, owner_sub: this.#ownerSub,
                sequence, document: execution,
              } satisfies ExecutionRow);
              meta.put({ key: `demo:replays:${document.id}`, value: materialized.replays });
              meta.put({ key: DEMO_MARKER_KEY, value: {
                status: 'INSTALLED', ownerSub: this.#ownerSub, studyId: document.id,
                packageVersion: input.package.packageVersion, packageDigest,
              } satisfies DemoMarker });
            }
            operations.add({ operation_id: input.operationId, owner_sub: this.#ownerSub,
              entity_kind: 'demo_install', entity_id: document.id, intent,
              result_document: studyRow(document).document,
              result_execution_ids: document.executions.map((execution) => execution.id),
            } satisfies StudyOperationRow);
            return structuredClone(document);
          });
        return validateStoredStudy(result, this.#ownerSub);
      } catch (error) {
        if (!(error instanceof DemoStateChangedError)) throw error;
      }
    }
    throw new OperationConflictError('A demonstração mudou durante a instalação. Tente novamente.');
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

  async listOperationalProfileVersions(companyId?: string): Promise<OperationalProfileVersion[]> {
    const database = await this.#database();
    const transaction = database.transaction('profile_versions', 'readonly');
    const index = transaction.objectStore('profile_versions')
      .index(companyId === undefined ? 'by_owner' : 'by_owner_company');
    const key = companyId === undefined ? this.#ownerSub : [this.#ownerSub, companyId];
    const rows = await requestResult<ProfileVersionRow[]>(index.getAll(key));
    return rows.map((row) => structuredClone(row.document)).sort((left, right) =>
      left.companyId.localeCompare(right.companyId)
      || left.version - right.version
      || left.id.localeCompare(right.id));
  }

  async getOperationalProfileVersion(id: string): Promise<OperationalProfileVersion | null> {
    const database = await this.#database();
    const transaction = database.transaction('profile_versions', 'readonly');
    const row = await requestResult<ProfileVersionRow | undefined>(
      transaction.objectStore('profile_versions').get(id),
    );
    return row?.owner_sub === this.#ownerSub ? structuredClone(row.document) : null;
  }

  async appendOperationalProfileVersion(
    input: AppendProfileVersionMutation,
  ): Promise<OperationalProfileVersion> {
    rejectBinary(input);
    validateMutation(0, input.operationId);
    const validation = await validateOperationalProfile(input.document);
    if (!validation.ok) {
      throw new InvalidDocumentError(validation.issues[0]?.message ?? 'Perfil Operacional inválido.');
    }
    if (input.document.ownerSub !== this.#ownerSub) throw new OwnerMismatchError();

    const database = await this.#database();
    const intent = canonical(input);
    return transactionResult(
      database,
      ['profile_versions', 'operations'],
      'readwrite',
      async (transaction) => {
        const operations = transaction.objectStore('operations');
        const previousOperation = await requestResult<OperationRow | undefined>(
          operations.get(input.operationId),
        );
        if (previousOperation !== undefined) {
          if (previousOperation.owner_sub !== this.#ownerSub
            || previousOperation.entity_kind !== 'profile_version'
            || previousOperation.entity_id !== input.document.id
            || previousOperation.intent !== intent) {
            throw new OperationConflictError();
          }
          return structuredClone(previousOperation.result_document);
        }

        const profiles = transaction.objectStore('profile_versions');
        const [sameIdentity, companyRows] = await Promise.all([
          requestResult<ProfileVersionRow | undefined>(profiles.get(input.document.id)),
          requestResult<ProfileVersionRow[]>(profiles.index('by_owner_company')
            .getAll([this.#ownerSub, input.document.companyId])),
        ]);
        if (sameIdentity !== undefined) {
          if (sameIdentity.owner_sub !== this.#ownerSub) throw new OwnerMismatchError();
          if (!sameDocument(sameIdentity.document, input.document)) {
            throw new OperationConflictError('Versão imutável já possui outro conteúdo.');
          }
        } else {
          const duplicateVersion = companyRows.find((row) => row.version === input.document.version);
          if (duplicateVersion !== undefined) {
            throw new OperationConflictError('Versão da empresa já foi alocada.');
          }
          const expectedVersion = companyRows.reduce(
            (maximum, row) => Math.max(maximum, row.version),
            0,
          ) + 1;
          if (input.document.version !== expectedVersion) {
            throw new InvalidDocumentError(`Versão esperada: ${expectedVersion}.`);
          }
          profiles.add({
            profile_version_id: input.document.id,
            owner_sub: this.#ownerSub,
            company_id: input.document.companyId,
            version: input.document.version,
            document: structuredClone(input.document),
          } satisfies ProfileVersionRow);
        }
        operations.add({
          operation_id: input.operationId,
          owner_sub: this.#ownerSub,
          entity_kind: 'profile_version',
          entity_id: input.document.id,
          intent,
          result_document: structuredClone(input.document),
        } satisfies ProfileVersionOperationRow);
        return structuredClone(input.document);
      },
    );
  }

  async confirmObservedCase(candidate: ConfirmObservedCaseMutation): Promise<ObservedCase> {
    rejectBinary(candidate);
    validateImportRecords(candidate);
    const input = structuredClone(candidate);
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

        const companyStore = transaction.objectStore('companies');
        const existingCompany = await requestResult<CompanyRow | undefined>(companyStore.get(company.id));
        if (existingCompany !== undefined) {
          if (existingCompany.owner_sub !== this.#ownerSub) throw new OwnerMismatchError();
          if (company.revision < existingCompany.document.revision) {
            throw new RevisionConflictError(company.revision, existingCompany.document.revision);
          }
          if (company.revision === existingCompany.document.revision
            && !sameDocument(company, existingCompany.document)) {
            throw new OperationConflictError('Empresa já possui outro conteúdo nesta revisão.');
          }
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

        companyStore.put({
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
      ['studies', 'executions', 'operations', 'meta'],
      'readwrite',
      async (transaction) => {
        const studies = transaction.objectStore('studies');
        const row = await requestResult<StudyRow | undefined>(studies.get(id));
        if (row === undefined || row.owner_sub !== this.#ownerSub) return;
        const executions = transaction.objectStore('executions');
        const operations = transaction.objectStore('operations');
        const [records, studyOperations, restoreOperations, demoOperations, markerRow] = await Promise.all([
          requestResult<ExecutionRow[]>(
            executions.index('by_owner_study').getAll([this.#ownerSub, id]),
          ),
          requestResult<StudyOperationRow[]>(
            operations.index('by_owner_entity').getAll([this.#ownerSub, 'study', id]),
          ),
          requestResult<StudyOperationRow[]>(
            operations.index('by_owner_entity').getAll([this.#ownerSub, 'restore_study', id]),
          ),
          requestResult<StudyOperationRow[]>(
            operations.index('by_owner_entity').getAll([this.#ownerSub, 'demo_install', id]),
          ),
          requestResult<unknown>(transaction.objectStore('meta').get(DEMO_MARKER_KEY)),
        ]);
        for (const execution of records) {
          executions.delete([execution.study_id, execution.execution_id]);
        }
        for (const operation of [...studyOperations, ...restoreOperations, ...demoOperations]) {
          operations.put({
            operation_id: operation.operation_id,
            owner_sub: this.#ownerSub,
            entity_kind: 'purged',
          } satisfies PurgedOperationRow);
        }
        const marker = readDemoMarker(markerRow, this.#ownerSub);
        if (marker?.studyId === id) {
          const meta = transaction.objectStore('meta');
          meta.put({ key: DEMO_MARKER_KEY, value: { ...marker, status: 'REMOVED' } satisfies DemoMarker });
          meta.delete(`demo:replays:${id}`);
        }
        studies.delete(id);
      },
    );
  }

  close(): void {
    this.#closed = true;
    this.#chat.close();
    void this.#databasePromise?.then(
      (database) => database.close(),
      () => undefined,
    );
  }
}

export { STORE_NAMES };
