import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import type { CompanyRecord, ObservedCase } from '../cases/domain';
import {
  appendExecution,
  createStudy,
  moveStudyToTrash,
  renameStudy,
} from '../study/domain';
import { FIXTURE_NOW, makeObservedCase, makeScenarioDraft } from '../study/fixtures';
import type { DeepMutable, ExecutionRecord, StudyDocument } from '../study/model';
import {
  BinaryDataNotAllowedError,
  OperationConflictError,
  OwnerMismatchError,
  RevisionConflictError,
  StorageClosedError,
} from './errors';
import { IndexedDbApplicationRepository } from './indexedDbApplicationRepository';

const PROJECT_REF = 'project-alpha';
const OWNER_SUB = 'owner-a';
const DATABASE_NAME = `motor-fluxo:app:v2:${PROJECT_REF}:${OWNER_SUB}`;
const OPERATION_A = 'operation-a';
const OPERATION_B = 'operation-b';
const OPERATION_C = 'operation-c';
const OPERATION_D = 'operation-d';
const OPERATION_E = 'operation-e';

function company(ownerSub = OWNER_SUB): CompanyRecord {
  return {
    id: 'company-1',
    ownerSub,
    displayName: 'Empresa A',
    aliases: ['A'],
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
    revision: 1,
  };
}

function observedCase(
  overrides: Partial<ObservedCase> = {},
): ObservedCase {
  return {
    ...makeObservedCase(),
    ownerSub: OWNER_SUB,
    revision: 1,
    ...overrides,
  };
}

async function study(
  id = '00000000-0000-4000-8000-000000000020',
  ownerSub = OWNER_SUB,
): Promise<StudyDocument> {
  return createStudy({
    id,
    ownerSub,
    name: 'Estudo A',
    baseScenario: makeScenarioDraft(),
    now: FIXTURE_NOW,
  });
}

function executionFor(document: StudyDocument): ExecutionRecord {
  const scenario = document.scenarios[0]!;
  return {
    id: '00000000-0000-4000-8000-000000000030',
    scenarioId: scenario.id,
    scenarioRevision: scenario.revision,
    inputFingerprint: scenario.inputFingerprint,
    requestSnapshot: {
      api_version: '1.0.0',
      request_id: '00000000-0000-4000-8000-000000000031',
      study_id: document.id,
      scenario_id: scenario.id,
      scenario_revision: scenario.revision,
      cenario: {
        ordens: structuredClone(scenario.sourceSnapshot.orders),
        horizonte_dias: 30,
        janela_dias: scenario.premises.windowDays,
        custo: structuredClone(scenario.premises.costs),
      },
      periodo: structuredClone(scenario.period.httpPeriod),
      proveniencia: {},
    },
    engineVersion: 'a'.repeat(40),
    contractVersion: '1.0.0',
    status: 'RUNNING',
    envelope: null,
    observedComparison: null,
    createdAt: '2026-09-19T12:01:00Z',
    finishedAt: null,
  };
}

const repositories: IndexedDbApplicationRepository[] = [];

function repository(
  projectRef = PROJECT_REF,
  ownerSub = OWNER_SUB,
): IndexedDbApplicationRepository {
  const result = new IndexedDbApplicationRepository({ projectRef, ownerSub });
  repositories.push(result);
  return result;
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    request.onblocked = () => reject(new Error(`Database deletion blocked: ${name}`));
  });
}

afterEach(async () => {
  for (const item of repositories.splice(0)) item.close();
  const databases = await indexedDB.databases();
  await Promise.all(databases
    .map((database) => database.name)
    .filter((name): name is string => name !== undefined)
    .map(deleteDatabase));
});

describe('IndexedDbApplicationRepository schema', () => {
  it('opens the scoped v2 database with the eight stores and listing indexes', async () => {
    await repository().listCompanies();

    const databases = await indexedDB.databases();
    expect(databases.map((database) => database.name)).toContain(DATABASE_NAME);

    const database = await openDatabase(DATABASE_NAME);
    expect([...database.objectStoreNames]).toEqual([
      'companies',
      'executions',
      'import_batches',
      'import_events',
      'meta',
      'observed_cases',
      'operations',
      'studies',
    ]);
    const transaction = database.transaction([...database.objectStoreNames], 'readonly');
    expect([...transaction.objectStore('companies').indexNames]).toEqual([
      'by_owner',
      'by_owner_display_name',
    ]);
    expect([...transaction.objectStore('observed_cases').indexNames]).toEqual([
      'by_owner',
      'by_owner_company',
    ]);
    expect([...transaction.objectStore('studies').indexNames]).toEqual([
      'by_owner',
      'by_owner_deleted',
    ]);
    expect([...transaction.objectStore('executions').indexNames]).toEqual([
      'by_owner',
      'by_owner_study',
    ]);
    expect([...transaction.objectStore('import_batches').indexNames]).toEqual([
      'by_owner',
      'by_owner_case',
      'by_owner_company',
    ]);
    expect([...transaction.objectStore('import_events').indexNames]).toEqual([
      'by_owner',
      'by_owner_case',
      'by_owner_company',
    ]);
    expect([...transaction.objectStore('operations').indexNames]).toEqual([
      'by_owner',
      'by_owner_entity',
    ]);
    expect(await requestResult<{ value: number }>(
      transaction.objectStore('meta').get('schema_version'),
    )).toEqual({ key: 'schema_version', value: 1 });
    database.close();
  });
});

describe('observed cases', () => {
  it('confirms company, case, batches and events atomically and repeats the operation idempotently', async () => {
    const target = repository();
    const caseDocument = observedCase();
    const mutation = {
      expectedRevision: 0,
      operationId: OPERATION_A,
      company: company(),
      observedCase: caseDocument,
      batches: [{
        caseId: caseDocument.id,
        batchSequence: 1,
        ownerSub: OWNER_SUB,
        companyId: caseDocument.companyId,
      }],
      events: [{
        caseId: caseDocument.id,
        eventSequence: 1,
        ownerSub: OWNER_SUB,
        companyId: caseDocument.companyId,
      }],
    } as const;

    expect(await target.confirmObservedCase(mutation)).toEqual(caseDocument);
    expect(await target.confirmObservedCase(structuredClone(mutation))).toEqual(caseDocument);
    expect(await target.listCompanies()).toEqual([company()]);
    expect(await target.listObservedCases()).toEqual([caseDocument]);
    expect(await target.listObservedCases('company-1')).toEqual([caseDocument]);
    expect(await target.listObservedCases('company-2')).toEqual([]);
    expect(await target.getObservedCase(caseDocument.id)).toEqual(caseDocument);

    const database = await openDatabase(DATABASE_NAME);
    const transaction = database.transaction(
      ['import_batches', 'import_events', 'operations'],
      'readonly',
    );
    const [batches, events, operationCount] = await Promise.all([
      requestResult<Array<{ document: typeof mutation.batches[number] }>>(
        transaction.objectStore('import_batches').getAll(),
      ),
      requestResult<Array<{ document: typeof mutation.events[number] }>>(
        transaction.objectStore('import_events').getAll(),
      ),
      requestResult(transaction.objectStore('operations').count()),
    ]);
    expect(batches.map((row) => row.document)).toEqual(mutation.batches);
    expect(events.map((row) => row.document)).toEqual(mutation.events);
    expect(operationCount).toBe(1);
    database.close();
  });

  it('keeps stale confirmation atomic and isolates owners in inputs and databases', async () => {
    const ownerA = repository();
    const first = observedCase();
    await ownerA.confirmObservedCase({
      expectedRevision: 0,
      operationId: OPERATION_A,
      company: company(),
      observedCase: first,
      batches: [],
      events: [],
    });

    await expect(ownerA.confirmObservedCase({
      expectedRevision: 0,
      operationId: OPERATION_B,
      company: { ...company(), displayName: 'Não deve persistir' },
      observedCase: observedCase({ revision: 1, confirmedAt: '2026-09-19T13:00:00Z' }),
      batches: [],
      events: [],
    })).rejects.toBeInstanceOf(RevisionConflictError);
    expect(await ownerA.listCompanies()).toEqual([company()]);
    expect(await ownerA.getObservedCase(first.id)).toEqual(first);

    const ownerB = repository(PROJECT_REF, 'owner-b');
    expect(await ownerB.listCompanies()).toEqual([]);
    expect(await ownerB.listObservedCases()).toEqual([]);
    await expect(ownerB.confirmObservedCase({
      expectedRevision: 0,
      operationId: OPERATION_C,
      company: company(),
      observedCase: first,
      batches: [],
      events: [],
    })).rejects.toBeInstanceOf(OwnerMismatchError);
  });

  it('rejects recursive binary values before opening a transaction', async () => {
    const target = repository();
    const binaryMutation = {
      expectedRevision: 0,
      operationId: OPERATION_A,
      company: company(),
      observedCase: observedCase(),
      batches: [],
      events: [{
        caseId: 'case-1',
        eventSequence: 1,
        ownerSub: OWNER_SUB,
        companyId: 'company-1',
        nested: [{ binary: new Blob(['not persisted']) }],
      }],
    };

    await expect(target.confirmObservedCase(binaryMutation))
      .rejects.toBeInstanceOf(BinaryDataNotAllowedError);
    if (typeof File !== 'undefined') {
      const fileMutation = structuredClone(binaryMutation);
      fileMutation.events[0]!.nested = [{ binary: new File(['not persisted'], 'source.xlsx') }];
      await expect(target.confirmObservedCase(fileMutation))
        .rejects.toBeInstanceOf(BinaryDataNotAllowedError);
    }
    expect(await target.listCompanies()).toEqual([]);
  });
});

describe('studies', () => {
  it('round-trips exact documents, filters trash, restores and purges', async () => {
    const target = repository();
    const original = await study();
    expect(await target.saveStudy({
      expectedRevision: 0,
      operationId: OPERATION_A,
      document: original,
    })).toEqual(original);
    expect(await target.getStudy(original.id)).toEqual(original);
    expect(await target.listStudies()).toEqual([original]);

    const trashed = await moveStudyToTrash(original, '2026-09-19T13:00:00Z');
    expect(await target.saveStudy({
      expectedRevision: 1,
      operationId: OPERATION_B,
      document: trashed,
    })).toEqual(trashed);
    expect(await target.listStudies()).toEqual([]);
    expect(await target.listStudies({ includeDeleted: true })).toEqual([trashed]);

    const restored = await target.restoreStudy(trashed.id, 2, OPERATION_C);
    expect(restored).toEqual({ ...trashed, revision: 3, deletedAt: null });
    expect(await target.restoreStudy(trashed.id, 2, OPERATION_C)).toEqual(restored);
    await target.purgeStudy(restored.id);
    expect(await target.getStudy(restored.id)).toBeNull();
  });

  it('stores executions separately and never rewrites an existing execution', async () => {
    const target = repository();
    const original = await study();
    await target.saveStudy({ expectedRevision: 0, operationId: OPERATION_A, document: original });
    const execution = executionFor(original);
    const withExecution = await appendExecution(original, execution, '2026-09-19T13:00:00Z');
    await target.saveStudy({
      expectedRevision: 1,
      operationId: OPERATION_B,
      document: withExecution,
    });

    const database = await openDatabase(DATABASE_NAME);
    const transaction = database.transaction(['studies', 'executions'], 'readonly');
    const studyRow = await requestResult<Record<string, unknown>>(
      transaction.objectStore('studies').get(original.id),
    );
    const executionRows = await requestResult<Array<{ document: ExecutionRecord }>>(
      transaction.objectStore('executions').index('by_owner_study')
        .getAll([OWNER_SUB, original.id]),
    );
    expect((studyRow.document as Record<string, unknown>).executions).toBeUndefined();
    expect(executionRows.map((row) => row.document)).toEqual([execution]);
    database.close();

    const changed = structuredClone(withExecution) as DeepMutable<StudyDocument>;
    changed.revision = 3;
    changed.updatedAt = '2026-09-19T14:00:00Z';
    changed.executions[0]!.createdAt = '2026-09-19T12:02:00Z';
    await expect(target.saveStudy({
      expectedRevision: 2,
      operationId: OPERATION_C,
      document: changed,
    })).rejects.toBeInstanceOf(OperationConflictError);
    expect(await target.getStudy(original.id)).toEqual(withExecution);
  });

  it('has one winner in a real CAS race between repository instances', async () => {
    const first = repository();
    const second = repository();
    const original = await study();
    await first.saveStudy({ expectedRevision: 0, operationId: OPERATION_A, document: original });
    const revision2 = await renameStudy(original, 'Revisão 2', '2026-09-19T12:10:00Z');
    await first.saveStudy({ expectedRevision: 1, operationId: OPERATION_B, document: revision2 });
    const revision3 = await renameStudy(revision2, 'Revisão 3', '2026-09-19T12:20:00Z');
    await first.saveStudy({ expectedRevision: 2, operationId: OPERATION_C, document: revision3 });
    const candidateA = await renameStudy(revision3, 'Candidato A', '2026-09-19T13:00:00Z');
    const candidateB = await renameStudy(revision3, 'Candidato B', '2026-09-19T13:00:00Z');

    const results = await Promise.allSettled([
      first.saveStudy({ expectedRevision: 3, operationId: OPERATION_D, document: candidateA }),
      second.saveStudy({ expectedRevision: 3, operationId: OPERATION_E, document: candidateB }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: expect.any(RevisionConflictError) });
    const stored = await first.getStudy(original.id);
    expect(stored?.revision).toBe(4);
    expect(['Candidato A', 'Candidato B']).toContain(stored?.name);
  });

  it('makes operation ids globally idempotent and rejects reuse for another intent', async () => {
    const target = repository();
    const original = await study();
    const mutation = { expectedRevision: 0, operationId: OPERATION_A, document: original };
    expect(await target.saveStudy(mutation)).toEqual(original);
    expect(await target.saveStudy(structuredClone(mutation))).toEqual(original);

    const other = await study('00000000-0000-4000-8000-000000000099');
    await expect(target.saveStudy({
      expectedRevision: 0,
      operationId: OPERATION_A,
      document: other,
    })).rejects.toBeInstanceOf(OperationConflictError);
    expect(await target.getStudy(other.id)).toBeNull();
  });

  it('rejects foreign owners and binary values before persistence', async () => {
    const target = repository();
    const foreign = await study('00000000-0000-4000-8000-000000000099', 'owner-b');
    await expect(target.saveStudy({
      expectedRevision: 0,
      operationId: OPERATION_A,
      document: foreign,
    })).rejects.toBeInstanceOf(OwnerMismatchError);

    const binary = structuredClone(await study()) as DeepMutable<StudyDocument> & { nested?: unknown };
    binary.nested = { values: [new Blob(['not persisted'])] };
    await expect(target.saveStudy({
      expectedRevision: 0,
      operationId: OPERATION_B,
      document: binary,
    })).rejects.toBeInstanceOf(BinaryDataNotAllowedError);
    expect(await target.listStudies({ includeDeleted: true })).toEqual([]);
  });
});

describe('lifecycle', () => {
  it('closes on logout without deleting data', async () => {
    const first = repository();
    const original = await study();
    await first.saveStudy({ expectedRevision: 0, operationId: OPERATION_A, document: original });
    first.close();
    await expect(first.getStudy(original.id)).rejects.toBeInstanceOf(StorageClosedError);

    const reopened = repository();
    expect(await reopened.getStudy(original.id)).toEqual(original);
  });

  it('closes the repository connection on versionchange', async () => {
    const target = repository();
    await target.listCompanies();
    const upgrade = indexedDB.open(DATABASE_NAME, 2);
    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      upgrade.onerror = () => reject(upgrade.error);
      upgrade.onsuccess = () => resolve(upgrade.result);
    });
    upgraded.close();

    await expect(target.listCompanies()).rejects.toBeInstanceOf(StorageClosedError);
  });
});
