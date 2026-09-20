import { IndexedDbApplicationRepository } from './storage/indexedDbApplicationRepository';
import type { CompanyRecord, ObservedCase } from './cases/domain';
import { recoverInterruptedExecution, readRecoveredDraft } from './storage/migrations';
import type { DeepMutable, PreviewExecutionRecord, StudyDocument } from './study/model';

const E2E_OWNER_SUB = '00000000-0000-4000-8000-000000000021';

export type MotorE2EBridge = Readonly<{
  migrateLegacyStudy(raw: string): Promise<readonly string[]>;
  seedObservedCase(company: CompanyRecord, observedCase: ObservedCase): Promise<void>;
  studySource(studyId: string): Promise<string | null>;
  studyName(studyId: string): Promise<string | null>;
  studyExecutionStatuses(studyId: string): Promise<readonly string[]>;
  profileVersions(companyId: string): Promise<readonly number[]>;
  profileSnapshot(studyId: string, ownerSub?: string): Promise<Readonly<{ attachedVersions: readonly number[]; availableVersions: readonly number[] }>>;
  previewAttemptShapes(studyId: string): Promise<readonly Readonly<{ reservation: number; terminal: number }>[]>;
  freezeStudyInput(studyId: string): Promise<void>;
  migrateLegacyFixtures(input: Readonly<{ draft: string; study: string; importer: string }>): Promise<Readonly<{ studies: readonly string[]; recoveredDraft: string | null; archivedImporter: boolean }>>;
  probeBlockedAndCorruptStorage(): Promise<Readonly<{ blocked: boolean; corruptionCode: string | null }>>;
  recoverInterruptedLegacyStudy(raw: string): Promise<readonly string[]>;
  prepareQuotaProbe(): Promise<Readonly<{ databaseName: string; nextVersion: number }>>;
  probeQuotaWrite(probe: Readonly<{ databaseName: string; nextVersion: number }>, bytes: number): Promise<
    | Readonly<{ stage: 'write'; event: 'complete'; requestEvent: 'success' }>
    | Readonly<{ stage: 'write'; event: 'abort'; requestEvent: 'success' | 'error'; errorName: string }>
  >;
}>;

declare global {
  interface Window {
    __MOTOR_E2E__?: MotorE2EBridge;
  }
}

export function installE2EBridge(): void {
  window.__MOTOR_E2E__ = Object.freeze({
    async freezeStudyInput(studyId: string) {
      const repository = new IndexedDbApplicationRepository({ projectRef: 'local', ownerSub: E2E_OWNER_SUB });
      try {
        const study = await repository.getStudy(studyId);
        if (study === null) throw new Error('Estudo E2E nao encontrado.');
        const frozen = structuredClone(study) as DeepMutable<StudyDocument>;
        const scenario = frozen.scenarios.find((item) => item.id === frozen.baseScenarioId);
        if (scenario === undefined) throw new Error('Cenario E2E nao encontrado.');
        delete scenario.sourceSnapshot.generationInputSnapshot;
        frozen.revision += 1;
        frozen.updatedAt = new Date().toISOString();
        await repository.saveStudy({
          expectedRevision: study.revision,
          operationId: crypto.randomUUID(),
          document: frozen,
        });
      } finally { repository.close(); }
    },
    async profileVersions(companyId: string) {
      const repository = new IndexedDbApplicationRepository({ projectRef: 'local', ownerSub: E2E_OWNER_SUB });
      try {
        return (await repository.listOperationalProfileVersions(companyId))
          .map((profile) => profile.version).sort((left, right) => left - right);
      } finally { repository.close(); }
    },
    async profileSnapshot(studyId: string, ownerSub = E2E_OWNER_SUB) {
      const repository = new IndexedDbApplicationRepository({ projectRef: 'local', ownerSub });
      try {
        const study = await repository.getStudy(studyId);
        if (study === null) return { attachedVersions: [], availableVersions: [] };
        const companyId = study.evidenceSnapshots[0]?.profile.companyId;
        const profiles = companyId === undefined
          ? []
          : await repository.listOperationalProfileVersions(companyId);
        return {
          attachedVersions: study.evidenceSnapshots.map((snapshot) => snapshot.profile.version).sort((left, right) => left - right),
          availableVersions: profiles.map((profile) => profile.version).sort((left, right) => left - right),
        };
      } finally { repository.close(); }
    },
    async previewAttemptShapes(studyId: string) {
      const repository = new IndexedDbApplicationRepository({ projectRef: 'local', ownerSub: E2E_OWNER_SUB });
      try {
        const study = await repository.getStudy(studyId);
        if (study === null) return [];
        const attempts = new Map<string, { reservation: number; terminal: number }>();
        for (const execution of study.executions) {
          if (execution.kind !== 'PREVIEW') continue;
          const key = execution.attemptId ?? execution.id;
          const shape = attempts.get(key) ?? { reservation: 0, terminal: 0 };
          if (execution.status === 'RUNNING') shape.reservation += 1;
          if (['SUCCEEDED', 'FAILED', 'INTERRUPTED'].includes(execution.status)) shape.terminal += 1;
          attempts.set(key, shape);
        }
        return [...attempts.values()];
      } finally { repository.close(); }
    },
    async prepareQuotaProbe() {
      return {
        databaseName: `motor-fluxo:quota-probe:${crypto.randomUUID()}`,
        nextVersion: 1,
      };
    },
    async probeQuotaWrite(probe: Readonly<{ databaseName: string; nextVersion: number }>, bytes: number) {
      return new Promise<
        | Readonly<{ stage: 'write'; event: 'complete'; requestEvent: 'success' }>
        | Readonly<{ stage: 'write'; event: 'abort'; requestEvent: 'success' | 'error'; errorName: string }>
      >((resolve, reject) => {
        const request = indexedDB.open(probe.databaseName, probe.nextVersion);
        let requestEvent: 'pending' | 'success' | 'error' = 'pending';
        let transactionEvent: 'pending' | 'complete' | 'abort' = 'pending';
        let settled = false;
        const finish = (result:
          | Readonly<{ stage: 'write'; event: 'complete'; requestEvent: 'success' }>
          | Readonly<{ stage: 'write'; event: 'abort'; requestEvent: 'success' | 'error'; errorName: string }>) => {
          if (!settled) { settled = true; resolve(result); }
        };
        request.onerror = () => {
          if (requestEvent === 'pending') { reject(request.error); return; }
          if (transactionEvent !== 'abort') {
            reject(new Error('A abertura falhou sem o evento abort da transação de escrita.'));
            return;
          }
          finish({
            stage: 'write', event: transactionEvent, requestEvent,
            errorName: request.error?.name ?? 'UNKNOWN',
          });
        };
        request.onsuccess = () => {
          request.result.close();
          if (requestEvent !== 'success' || transactionEvent !== 'complete') {
            reject(new Error('A escrita de quota não confirmou antes do complete da transação.'));
            return;
          }
          finish({ stage: 'write', event: transactionEvent, requestEvent });
        };
        request.onupgradeneeded = () => {
          const transaction = request.transaction;
          if (transaction === null) { reject(new Error('Versionchange sem transação.')); return; }
          transaction.oncomplete = () => { transactionEvent = 'complete'; };
          transaction.onabort = () => { transactionEvent = 'abort'; };
          try {
            for (let index = 0; index < 8; index += 1) {
              const padding = request.result.createObjectStore(`padding-${index}`, { keyPath: 'key' });
              padding.createIndex('by_owner', 'owner');
              padding.createIndex('by_owner_entity', ['owner', 'entity']);
            }
            const value = new Uint8Array(bytes);
            let state = 0x6d2b79f5;
            for (let index = 0; index < value.length; index += 1) {
              state ^= state << 13;
              state ^= state >>> 17;
              state ^= state << 5;
              value[index] = state & 0xff;
            }
            const store = request.result.createObjectStore(
              `quota-probe-v${probe.nextVersion}`,
              { keyPath: 'key' },
            );
            const write = store.put({
              key: `quota-probe-v${probe.nextVersion}`,
              value: value.buffer,
            });
            write.onsuccess = () => { requestEvent = 'success'; };
            write.onerror = () => { requestEvent = 'error'; };
          } catch (error) {
            reject(error);
          }
        };
      });
    },
    async recoverInterruptedLegacyStudy(raw: string) {
      const projectRef = `e2e-interrupted-${crypto.randomUUID()}`;
      const repository = new IndexedDbApplicationRepository({
        projectRef,
        ownerSub: E2E_OWNER_SUB,
        migrationSources: { legacyStudies: [{ sourceKey: 'interrupted-v1', raw }] },
      });
      try {
        const original = (await repository.listStudies())[0];
        if (original === undefined) throw new Error('Migração não criou o estudo interrompido.');
        const scenario = original.scenarios[0]!;
        const evidence = { tipo: 'PADRAO_SINTETICO' as const, fonte: 'fixture E2E', registrado_em_utc: '2026-09-19T12:00:00Z' };
        const provenance: Record<string, typeof evidence> = {
          '/horizonte_dias': evidence, '/janela_dias': evidence,
          '/custo/iof_out': evidence, '/custo/iof_in': evidence, '/custo/carry_cnr': evidence,
          '/custo/spread_rail_bps': evidence, '/custo/custo_fixo_remessa': evidence,
          '/custo/custo_oportunidade_aa': evidence, '/custo/ptax': evidence,
        };
        scenario.sourceSnapshot.orders.forEach((_, index) => {
          for (const field of ['dia_conhecida', 'dia_limite', 'eh_efx', 'finalidade', 'valor_brl']) {
            provenance[`/ordens/${index}/${field}`] = evidence;
          }
        });
        const running: PreviewExecutionRecord = {
          kind: 'PREVIEW',
          id: crypto.randomUUID(), scenarioId: scenario.id, scenarioRevision: scenario.revision,
          inputFingerprint: scenario.inputFingerprint,
          requestSnapshot: {
            api_version: '1.0.0', request_id: crypto.randomUUID(), study_id: original.id,
            scenario_id: scenario.id, scenario_revision: scenario.revision,
            cenario: { ordens: structuredClone(scenario.sourceSnapshot.orders), janela_dias: scenario.premises.windowDays, horizonte_dias: 3, custo: structuredClone(scenario.premises.costs) },
            periodo: { modo: 'LEGADO' }, proveniencia: provenance,
          },
          engineVersion: 'pending', contractVersion: '1.0.0', status: 'RUNNING', envelope: null,
          observedComparison: null, createdAt: '2026-09-19T12:00:00Z', finishedAt: null,
        };
        const pending = structuredClone(original) as DeepMutable<StudyDocument>;
        pending.revision += 1;
        pending.updatedAt = '2026-09-19T12:00:00Z';
        pending.executions.push(running as DeepMutable<PreviewExecutionRecord>);
        await repository.saveStudy({ expectedRevision: original.revision, operationId: crypto.randomUUID(), document: pending });
        const recovered = await recoverInterruptedExecution(repository, original.id, pending.revision, crypto.randomUUID(), '2026-09-19T12:01:00Z');
        return recovered.executions.map((execution) => execution.status);
      } finally {
        repository.close();
      }
    },
    async probeBlockedAndCorruptStorage() {
      const blockedName = `motor-e2e-blocked-${crypto.randomUUID()}`;
      const first = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(blockedName, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const blocked = await new Promise<boolean>((resolve) => {
        const request = indexedDB.open(blockedName, 2);
        request.onblocked = () => resolve(true);
        request.onerror = () => resolve(false);
        request.onsuccess = () => { request.result.close(); resolve(false); };
      });
      first.close();

      const projectRef = `e2e-corrupt-${crypto.randomUUID()}`;
      const repository = new IndexedDbApplicationRepository({ projectRef, ownerSub: E2E_OWNER_SUB });
      await repository.listStudies();
      const databaseName = `motor-fluxo:app:v2:${encodeURIComponent(projectRef)}:${encodeURIComponent(E2E_OWNER_SUB)}`;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('studies', 'readwrite');
        transaction.objectStore('studies').put({ study_id: 'corrupt', owner_sub: E2E_OWNER_SUB, deleted: 0, document: { schemaVersion: '2.0.0', id: 'corrupt', ownerSub: E2E_OWNER_SUB } });
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
      let corruptionCode: string | null = null;
      try { await repository.getStudy('corrupt'); } catch (error) {
        corruptionCode = error !== null && typeof error === 'object' && 'code' in error
          ? String(error.code) : 'UNKNOWN';
      } finally { repository.close(); }
      return { blocked, corruptionCode };
    },
    async migrateLegacyFixtures(input: Readonly<{ draft: string; study: string; importer: string }>) {
      const projectRef = `e2e-migrations-${crypto.randomUUID()}`;
      const repository = new IndexedDbApplicationRepository({
        projectRef, ownerSub: E2E_OWNER_SUB,
        migrationSources: {
          stage1Drafts: [{ sourceKey: 'stage1-draft-v1.json', raw: input.draft }],
          legacyStudies: [{ sourceKey: 'study-document-v1.json', raw: input.study }],
          importerDatabases: [{ sourceKey: 'importer-database-v1.json', raw: input.importer }],
        },
      });
      try {
        const studies = await repository.listStudies();
        const databaseName = `motor-fluxo:app:v2:${encodeURIComponent(projectRef)}:${encodeURIComponent(E2E_OWNER_SUB)}`;
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(databaseName);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
        try {
          const recovered = await readRecoveredDraft(database, E2E_OWNER_SUB);
          const archived = await new Promise<unknown>((resolve, reject) => {
            const request = database.transaction('meta').objectStore('meta').get('archive:importer:importer-database-v1.json');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
          });
          return { studies: studies.map((study) => study.id), recoveredDraft: recovered?.name ?? null, archivedImporter: archived !== undefined };
        } finally { database.close(); }
      } finally { repository.close(); }
    },
    async studyName(studyId: string) {
      const repository = new IndexedDbApplicationRepository({
        projectRef: 'local', ownerSub: E2E_OWNER_SUB,
      });
      try {
        return (await repository.getStudy(studyId))?.name ?? null;
      } finally {
        repository.close();
      }
    },
    async studyExecutionStatuses(studyId: string) {
      const repository = new IndexedDbApplicationRepository({
        projectRef: 'local', ownerSub: E2E_OWNER_SUB,
      });
      try {
        return (await repository.getStudy(studyId))?.executions.map((item) => item.status) ?? [];
      } finally {
        repository.close();
      }
    },
    async studySource(studyId: string) {
      const repository = new IndexedDbApplicationRepository({
        projectRef: 'local', ownerSub: E2E_OWNER_SUB,
      });
      try {
        const study = await repository.getStudy(studyId);
        if (study === null) return null;
        const scenario = study.scenarios.find((item) => item.id === study.baseScenarioId);
        if (scenario === undefined) return null;
        const source = scenario.sourceSnapshot.source;
        return source.kind === 'SYNTHETIC' ? `${source.kind}:${source.recipe.exampleId}` : source.kind;
      } finally {
        repository.close();
      }
    },
    async seedObservedCase(company: CompanyRecord, observedCase: ObservedCase) {
      const repository = new IndexedDbApplicationRepository({
        projectRef: 'local', ownerSub: E2E_OWNER_SUB,
      });
      try {
        await repository.confirmObservedCase({
          expectedRevision: 0,
          operationId: crypto.randomUUID(),
          company,
          observedCase,
          batches: [],
          events: [],
        });
      } finally {
        repository.close();
      }
    },
    async migrateLegacyStudy(raw: string) {
      const repository = new IndexedDbApplicationRepository({
        projectRef: `e2e-migration-${crypto.randomUUID()}`,
        ownerSub: E2E_OWNER_SUB,
        migrationSources: {
          legacyStudies: [{ sourceKey: 'study-document-v1.json', raw }],
        },
      });
      try {
        return (await repository.listStudies()).map((study) => study.id);
      } finally {
        repository.close();
      }
    },
  });
}
