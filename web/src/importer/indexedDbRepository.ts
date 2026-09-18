import type { ImportStudy } from './domain';
import {
  editOperation,
  excludeOperation,
  incorporateBatch,
  resolveVersionConflict,
  restoreOperation,
  revertBatch,
} from './portfolio';
import { normalizeClientNameKey } from './clients';
import type {
  ImportChangeNotice,
  ImportExecutionRecord,
  ImportRepository,
  ImportStudyHeader,
  StudyMutation,
} from './repository';
import { RevisionConflictError } from './repository';

const DATABASE_VERSION = 1;
const STORE_NAMES = [
  'aliases',
  'batches',
  'clients',
  'events',
  'executions',
  'studies',
  'versions',
] as const;
const STUDY_CHILD_STORES = [
  'aliases',
  'batches',
  'clients',
  'events',
  'versions',
] as const;

type StudyRecord = {
  id: string;
  ownerSub: string;
  document: ImportStudy;
  appliedOperations: Map<string, number>;
};

type ChannelLike = {
  postMessage(message: ImportChangeNotice): void;
  close(): void;
  addEventListener?: (
    type: 'message',
    listener: (event: MessageEvent<ImportChangeNotice>) => void,
  ) => void;
};

export type IndexedDbImportRepositoryOptions = {
  indexedDB?: IDBFactory;
  projectRef: string;
  ownerSub: string;
  broadcastChannelFactory?: ((name: string) => ChannelLike) | null;
};

function validateScopeSegment(value: string): void {
  if (value.trim() === '' || value.includes(':')) {
    throw new Error('INVALID_DATABASE_SCOPE: segmento vazio ou contendo dois-pontos');
  }
}

export function databaseName(projectRef: string, ownerSub: string): string {
  validateScopeSegment(projectRef);
  validateScopeSegment(ownerSub);
  return `motor-fluxo:imports:v1:${projectRef}:${ownerSub}`;
}

function channelName(projectRef: string, ownerSub: string): string {
  return `motor-fluxo:imports:${projectRef}:${ownerSub}`;
}

function hasBinary(value: unknown, seen = new Set<object>()): boolean {
  if (
    value instanceof ArrayBuffer
    || ArrayBuffer.isView(value)
    || (typeof Blob !== 'undefined' && value instanceof Blob)
    || (typeof File !== 'undefined' && value instanceof File)
  ) {
    return true;
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return false;
  }
  seen.add(value);
  return Object.values(value).some((item) => hasBinary(item, seen));
}

function requireSerializable(value: unknown): void {
  if (hasBinary(value)) {
    throw new Error('BINARY_DATA_NOT_ALLOWED: arquivo original não pode ser persistido');
  }
  structuredClone(value);
}

function requestError(request: IDBRequest): Error {
  return request.error ?? new Error('INDEXED_DB_REQUEST_FAILED');
}

function ensureOwner(record: { ownerSub: string }, ownerSub: string): void {
  if (record.ownerSub !== ownerSub) {
    throw new Error('OWNER_SCOPE_MISMATCH: registro pertence a outra conta');
  }
}

function applyMutation(study: ImportStudy, mutation: StudyMutation): ImportStudy {
  switch (mutation.kind) {
    case 'INCORPORATE_BATCH':
      return incorporateBatch(study, mutation.batch);
    case 'RESOLVE_VERSION_CONFLICT':
      return resolveVersionConflict(study, mutation.resolution);
    case 'REVERT_BATCH':
      return revertBatch(study, mutation.batchId);
    case 'EDIT_OPERATION':
      return editOperation(study, mutation);
    case 'EXCLUDE_OPERATION':
      return excludeOperation(study, mutation);
    case 'RESTORE_OPERATION':
      return restoreOperation(study, mutation);
  }
}

function scheduleDeleteByStudy(
  transaction: IDBTransaction,
  storeName: typeof STUDY_CHILD_STORES[number] | 'executions',
  studyId: string,
  afterDelete?: () => void,
): void {
  const store = transaction.objectStore(storeName);
  const keys = store.index('study_id').getAllKeys(IDBKeyRange.only(studyId));
  keys.onerror = () => transaction.abort();
  keys.onsuccess = () => {
    for (const key of keys.result) {
      store.delete(key);
    }
    afterDelete?.();
  };
}

function scheduleProjection(
  transaction: IDBTransaction,
  study: ImportStudy,
  ownerSub: string,
): void {
  scheduleDeleteByStudy(transaction, 'batches', study.id, () => {
    const store = transaction.objectStore('batches');
    for (const batch of study.batches) {
      store.put({
        key: `${study.id}:${batch.id}`,
        studyId: study.id,
        ownerSub,
        batch,
      });
    }
  });
  scheduleDeleteByStudy(transaction, 'versions', study.id, () => {
    const store = transaction.objectStore('versions');
    for (const batch of study.batches) {
      for (const row of batch.rows) {
        store.put({
          key: `${study.id}:${row.versionId}`,
          studyId: study.id,
          ownerSub,
          batchId: batch.id,
          row,
        });
      }
    }
  });
  scheduleDeleteByStudy(transaction, 'events', study.id, () => {
    const store = transaction.objectStore('events');
    for (const event of study.events) {
      store.put({
        key: `${study.id}:${event.id}`,
        studyId: study.id,
        ownerSub,
        event,
      });
    }
  });

  const clients = new Map<string, string>();
  for (const batch of study.batches) {
    for (const row of batch.rows) {
      if (row.normalized !== null) {
        clients.set(row.canonicalClientId, row.normalized.clientName);
      }
    }
  }
  scheduleDeleteByStudy(transaction, 'clients', study.id, () => {
    const store = transaction.objectStore('clients');
    for (const [id, displayName] of clients) {
      store.put({
        key: `${study.id}:${id}`,
        studyId: study.id,
        ownerSub,
        client: { id, displayName },
      });
    }
  });
  scheduleDeleteByStudy(transaction, 'aliases', study.id, () => {
    const store = transaction.objectStore('aliases');
    for (const [canonicalClientId, displayVariant] of clients) {
      const normalizedName = normalizeClientNameKey(displayVariant);
      store.put({
        key: `${study.id}:${normalizedName}`,
        studyId: study.id,
        ownerSub,
        normalizedName,
        canonicalClientId,
        displayVariant,
      });
    }
  });
}

function createSchema(database: IDBDatabase): void {
  const studies = database.createObjectStore('studies', { keyPath: 'id' });
  studies.createIndex('owner_sub', 'ownerSub', { unique: false });
  for (const name of STORE_NAMES) {
    if (name === 'studies') {
      continue;
    }
    const store = database.createObjectStore(name, { keyPath: 'key' });
    store.createIndex('study_id', 'studyId', { unique: false });
  }
}

export class IndexedDbImportRepository implements ImportRepository {
  readonly #factory: IDBFactory;
  readonly #name: string;
  readonly #ownerSub: string;
  readonly #channel: ChannelLike | null;
  readonly #listeners = new Set<(notice: ImportChangeNotice) => void>();
  #databasePromise: Promise<IDBDatabase> | null = null;
  #database: IDBDatabase | null = null;

  constructor(options: IndexedDbImportRepositoryOptions) {
    this.#factory = options.indexedDB ?? globalThis.indexedDB;
    this.#ownerSub = options.ownerSub;
    this.#name = databaseName(options.projectRef, options.ownerSub);
    const factory = options.broadcastChannelFactory === undefined
      ? (typeof BroadcastChannel === 'undefined'
          ? null
          : (name: string) => new BroadcastChannel(name))
      : options.broadcastChannelFactory;
    this.#channel = factory?.(channelName(
      options.projectRef,
      options.ownerSub,
    )) ?? null;
    this.#channel?.addEventListener?.('message', (event) => {
      for (const listener of this.#listeners) {
        listener(event.data);
      }
    });
  }

  subscribe(listener: (notice: ImportChangeNotice) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async #open(): Promise<IDBDatabase> {
    if (this.#databasePromise !== null) {
      return this.#databasePromise;
    }
    this.#databasePromise = new Promise((resolve, reject) => {
      const request = this.#factory.open(this.#name, DATABASE_VERSION);
      request.onupgradeneeded = () => createSchema(request.result);
      request.onerror = () => reject(requestError(request));
      request.onblocked = () => reject(new Error('DATABASE_OPEN_BLOCKED'));
      request.onsuccess = () => {
        this.#database = request.result;
        request.result.onversionchange = () => {
          request.result.close();
          this.#database = null;
          this.#databasePromise = null;
        };
        resolve(request.result);
      };
    });
    return this.#databasePromise;
  }

  async listStudies(): Promise<ImportStudyHeader[]> {
    const database = await this.#open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('studies', 'readonly');
      const request = transaction.objectStore('studies').getAll();
      request.onerror = () => reject(requestError(request));
      request.onsuccess = () => {
        try {
          const records = request.result as StudyRecord[];
          records.forEach((record) => ensureOwner(record, this.#ownerSub));
          resolve(records.map(({ document }) => ({
            id: document.id,
            name: document.name,
            revision: document.revision,
            createdAtUtc: document.createdAtUtc,
            updatedAtUtc: document.updatedAtUtc,
          })).sort((left, right) => left.id.localeCompare(right.id)));
        } catch (error) {
          reject(error);
        }
      };
    });
  }

  async loadStudy(studyId: string): Promise<ImportStudy | null> {
    const database = await this.#open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('studies', 'readonly');
      const request = transaction.objectStore('studies').get(studyId);
      request.onerror = () => reject(requestError(request));
      request.onsuccess = () => {
        try {
          const record = request.result as StudyRecord | undefined;
          if (record === undefined) {
            resolve(null);
            return;
          }
          ensureOwner(record, this.#ownerSub);
          resolve(record.document);
        } catch (error) {
          reject(error);
        }
      };
    });
  }

  async createStudy(study: ImportStudy): Promise<void> {
    requireSerializable(study);
    const database = await this.#open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(
        STORE_NAMES,
        'readwrite',
        { durability: 'strict' },
      );
      const store = transaction.objectStore('studies');
      const existing = store.get(study.id);
      existing.onerror = () => transaction.abort();
      existing.onsuccess = () => {
        if (existing.result !== undefined) {
          transaction.abort();
          return;
        }
        store.put({
          id: study.id,
          ownerSub: this.#ownerSub,
          document: study,
          appliedOperations: new Map(),
        } satisfies StudyRecord);
        scheduleProjection(transaction, study, this.#ownerSub);
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(
        transaction.error ?? new Error('STUDY_ALREADY_EXISTS'),
      );
      transaction.onerror = () => undefined;
    });
  }

  async mutateStudy(input: {
    studyId: string;
    expectedRevision: number;
    operationId: string;
    mutation: StudyMutation;
  }): Promise<ImportStudy> {
    requireSerializable(input);
    const database = await this.#open();
    return new Promise((resolve, reject) => {
      let result: ImportStudy | null = null;
      let committed = false;
      let failure: Error | null = null;
      const transaction = database.transaction(
        STORE_NAMES,
        'readwrite',
        { durability: 'strict' },
      );
      const store = transaction.objectStore('studies');
      const request = store.get(input.studyId);
      request.onerror = () => transaction.abort();
      request.onsuccess = () => {
        try {
          const record = request.result as StudyRecord | undefined;
          if (record === undefined) {
            throw new Error('STUDY_NOT_FOUND');
          }
          ensureOwner(record, this.#ownerSub);
          const applied = record.appliedOperations.get(input.operationId);
          if (applied !== undefined) {
            result = record.document;
            return;
          }
          if (record.document.revision !== input.expectedRevision) {
            throw new RevisionConflictError();
          }
          const mutated = applyMutation(record.document, input.mutation);
          const next = {
            ...mutated,
            revision: record.document.revision + 1,
          };
          result = next;
          committed = true;
          const appliedOperations = new Map(record.appliedOperations);
          appliedOperations.set(input.operationId, next.revision);
          store.put({
            ...record,
            document: next,
            appliedOperations,
          } satisfies StudyRecord);
          scheduleProjection(transaction, next, this.#ownerSub);
        } catch (error) {
          failure = error instanceof Error ? error : new Error(String(error));
          transaction.abort();
        }
      };
      transaction.oncomplete = () => {
        if (result === null) {
          reject(new Error('MUTATION_DID_NOT_PRODUCE_STATE'));
          return;
        }
        if (committed) {
          this.#channel?.postMessage({
            studyId: input.studyId,
            revision: result.revision,
            operationId: input.operationId,
          });
        }
        resolve(result);
      };
      transaction.onabort = () => reject(
        failure ?? transaction.error ?? new Error('TRANSACTION_ABORTED'),
      );
      transaction.onerror = () => undefined;
    });
  }

  async saveExecution(
    record: ImportExecutionRecord,
    expectedRevision: number,
  ): Promise<void> {
    requireSerializable(record);
    if (record.ownerSub !== this.#ownerSub) {
      throw new Error('OWNER_SCOPE_MISMATCH: execução pertence a outra conta');
    }
    const database = await this.#open();
    return new Promise((resolve, reject) => {
      let failure: Error | null = null;
      const transaction = database.transaction(
        ['studies', 'executions'],
        'readwrite',
        { durability: 'strict' },
      );
      const request = transaction.objectStore('studies').get(record.studyId);
      request.onerror = () => transaction.abort();
      request.onsuccess = () => {
        try {
          const study = request.result as StudyRecord | undefined;
          if (study === undefined) {
            throw new Error('STUDY_NOT_FOUND');
          }
          ensureOwner(study, this.#ownerSub);
          if (study.document.revision !== expectedRevision) {
            throw new RevisionConflictError();
          }
          transaction.objectStore('executions').put({
            ...record,
            key: `${record.studyId}:${record.id}`,
          });
        } catch (error) {
          failure = error instanceof Error ? error : new Error(String(error));
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(
        failure ?? transaction.error ?? new Error('TRANSACTION_ABORTED'),
      );
      transaction.onerror = () => undefined;
    });
  }

  async deleteStudy(studyId: string): Promise<void> {
    const database = await this.#open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(
        STORE_NAMES,
        'readwrite',
        { durability: 'strict' },
      );
      let failure: Error | null = null;
      const studies = transaction.objectStore('studies');
      const request = studies.get(studyId);
      request.onerror = () => transaction.abort();
      request.onsuccess = () => {
        try {
          const record = request.result as StudyRecord | undefined;
          if (record !== undefined) {
            ensureOwner(record, this.#ownerSub);
          }
          studies.delete(studyId);
          for (const storeName of [...STUDY_CHILD_STORES, 'executions'] as const) {
            scheduleDeleteByStudy(transaction, storeName, studyId);
          }
        } catch (error) {
          failure = error instanceof Error ? error : new Error(String(error));
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(
        failure ?? transaction.error ?? new Error('TRANSACTION_ABORTED'),
      );
      transaction.onerror = () => undefined;
    });
  }

  async deleteAllLocalData(): Promise<void> {
    this.close();
    return new Promise((resolve, reject) => {
      const request = this.#factory.deleteDatabase(this.#name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(requestError(request));
      request.onblocked = () => reject(new Error(
        'DATABASE_DELETE_BLOCKED: feche as outras abas e tente novamente',
      ));
    });
  }

  close(): void {
    this.#channel?.close();
    this.#database?.close();
    this.#database = null;
    this.#databasePromise = null;
  }
}
