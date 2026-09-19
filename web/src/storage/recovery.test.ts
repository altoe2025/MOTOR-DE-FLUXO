import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import type { CompanyRecord } from '../cases/domain';
import { createStudy, moveStudyToTrash } from '../study/domain';
import { FIXTURE_NOW, makeObservedCase, makeObservedSnapshot, makeScenarioDraft } from '../study/fixtures';
import type { DeepMutable, ExecutionRecord, StudyDocument } from '../study/model';
import { IndexedDbApplicationRepository } from './indexedDbApplicationRepository';
import { recoverInterruptedExecution, recoverInterruptedStudy } from './migrations';

const PROJECT_REF = 'project-alpha';
const OWNER_SUB = 'owner-a';
const DATABASE_NAME = `motor-fluxo:app:v2:${PROJECT_REF}:${OWNER_SUB}`;

const repositories: IndexedDbApplicationRepository[] = [];

function repository(): IndexedDbApplicationRepository {
  const result = new IndexedDbApplicationRepository({ projectRef: PROJECT_REF, ownerSub: OWNER_SUB });
  repositories.push(result);
  return result;
}

async function studyWithRunningExecution(): Promise<StudyDocument> {
  const document = await createStudy({
    id: '00000000-0000-4000-8000-000000000020',
    ownerSub: OWNER_SUB,
    name: 'Em execução',
    baseScenario: makeScenarioDraft(),
    now: FIXTURE_NOW,
  });
  const mutable = structuredClone(document) as DeepMutable<StudyDocument>;
  const scenario = mutable.scenarios[0]!;
  const execution: ExecutionRecord = {
    id: '00000000-0000-4000-8000-000000000030',
    scenarioId: scenario.id,
    scenarioRevision: scenario.revision,
    inputFingerprint: scenario.inputFingerprint,
    requestSnapshot: {
      api_version: '1.0.0',
      request_id: '00000000-0000-4000-8000-000000000031',
      study_id: mutable.id,
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
  mutable.executions.push(execution as DeepMutable<ExecutionRecord>);
  return mutable;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`blocked: ${name}`));
    request.onsuccess = () => resolve();
  });
}

afterEach(async () => {
  for (const item of repositories.splice(0)) item.close();
  await deleteDatabase(DATABASE_NAME);
});

describe('recovery', () => {
  it('turns an in-flight execution into INTERRUPTED without creating another request', async () => {
    const running = await studyWithRunningExecution();

    const recovered = await recoverInterruptedStudy(running, '2026-09-19T12:05:00Z');

    expect(recovered.revision).toBe(running.revision + 1);
    expect(recovered.executions).toEqual([
      expect.objectContaining({
        id: running.executions[0]?.id,
        status: 'INTERRUPTED',
        finishedAt: '2026-09-19T12:05:00Z',
        requestSnapshot: running.executions[0]?.requestSnapshot,
      }),
    ]);
    expect(recovered.executions).toHaveLength(1);
    expect(await recoverInterruptedStudy(recovered, '2026-09-19T12:06:00Z')).toBe(recovered);
  });

  it('persists interrupted recovery through the repository CAS operation', async () => {
    const target = repository();
    const running = await studyWithRunningExecution();
    await target.saveStudy({ expectedRevision: 0, operationId: 'save-running', document: running });

    const recovered = await recoverInterruptedExecution(
      target,
      running.id,
      running.revision,
      'recover-running',
      '2026-09-19T12:05:00Z',
    );

    expect(recovered).toMatchObject({
      revision: 2,
      executions: [{ status: 'INTERRUPTED', finishedAt: '2026-09-19T12:05:00Z' }],
    });
    expect(await target.getStudy(running.id)).toEqual(recovered);
    expect(await recoverInterruptedExecution(
      target,
      running.id,
      recovered.revision,
      'recover-running',
      '2026-09-19T12:06:00Z',
    )).toEqual(recovered);
  });

  it('restores through CAS and purges study, executions and sensitive operation history atomically', async () => {
    const target = repository();
    const original = await studyWithRunningExecution();
    await target.saveStudy({ expectedRevision: 0, operationId: 'save-1', document: original });
    const trashed = await moveStudyToTrash(original, '2026-09-19T13:00:00Z');
    await target.saveStudy({ expectedRevision: 1, operationId: 'trash-1', document: trashed });

    const restored = await target.restoreStudy(trashed.id, 2, 'restore-1');
    expect(restored).toMatchObject({ revision: 3, deletedAt: null });
    expect(await target.restoreStudy(trashed.id, 2, 'restore-1')).toEqual(restored);

    await target.purgeStudy(restored.id);
    expect(await target.getStudy(restored.id)).toBeNull();
    target.close();

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction(['studies', 'executions', 'operations'], 'readonly');
    const [studies, executions, operations] = await Promise.all([
      requestResult(transaction.objectStore('studies').count()),
      requestResult(transaction.objectStore('executions').count()),
      requestResult<Array<Record<string, unknown>>>(transaction.objectStore('operations').getAll()),
    ]);
    expect({ studies, executions }).toEqual({ studies: 0, executions: 0 });
    expect(operations).toEqual([
      { operation_id: 'restore-1', owner_sub: OWNER_SUB, entity_kind: 'purged' },
      { operation_id: 'save-1', owner_sub: OWNER_SUB, entity_kind: 'purged' },
      { operation_id: 'trash-1', owner_sub: OWNER_SUB, entity_kind: 'purged' },
    ]);
    database.close();
  });

  it('does not alter the observed case when purging a study built from its snapshot', async () => {
    const target = repository();
    const observed = { ...makeObservedCase(), ownerSub: OWNER_SUB, revision: 1 };
    const company: CompanyRecord = {
      id: observed.companyId,
      ownerSub: OWNER_SUB,
      displayName: 'Empresa observada',
      aliases: [],
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
      revision: 1,
    };
    await target.confirmObservedCase({
      expectedRevision: 0,
      operationId: 'case-1',
      company,
      observedCase: observed,
      batches: [],
      events: [],
    });
    const linkedStudy = await createStudy({
      id: '00000000-0000-4000-8000-000000000099',
      ownerSub: OWNER_SUB,
      name: 'Snapshot observado',
      baseScenario: makeScenarioDraft({ sourceSnapshot: makeObservedSnapshot(observed) }),
      now: FIXTURE_NOW,
    });
    await target.saveStudy({ expectedRevision: 0, operationId: 'study-1', document: linkedStudy });

    await target.purgeStudy(linkedStudy.id);

    expect(await target.getObservedCase(observed.id)).toEqual(observed);
  });
});
