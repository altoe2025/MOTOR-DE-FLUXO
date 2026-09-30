import type { Page } from '@playwright/test';
import { appendScenario } from '../../src/study/domain';
import type { StudyDocument } from '../../src/study/model';

/** Test arrangement for the retired wizard; execution/publication still use the real UI. */
export async function readStoredStudy(page: Page, studyId: string) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('motor-fluxo:app:v2:local:00000000-0000-4000-8000-000000000021');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const transaction = db.transaction(['studies', 'executions']);
      const request = transaction.objectStore('studies').get(id);
      const executions = transaction.objectStore('executions').getAll();
      const read = <T,>(item: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
        item.onsuccess = () => resolve(item.result); item.onerror = () => reject(item.error);
      });
      const [row, records] = await Promise.all([
        read(request) as Promise<{ document: Omit<StudyDocument, 'executions'> }>,
        read(executions) as Promise<Array<{ study_id: string; sequence: number; document: StudyDocument['executions'][number] }>>,
      ]);
      return { ...row.document, executions: records.filter((item) => item.study_id === id)
        .sort((a, b) => a.sequence - b.sequence).map((item) => item.document) } as StudyDocument;
    } finally { db.close(); }
  }, studyId);
}

export async function seedWindowScenario(page: Page, studyId: string, windowDays = 8) {
  const study = await readStoredStudy(page, studyId);
  const base = study.scenarios.find((item) => item.id === study.baseScenarioId)!;
  const id = crypto.randomUUID();
  const updated = await appendScenario(study, {
    ...base, id, name: `Janela ${windowDays} dias`, premises: { ...base.premises, windowDays },
    sourceSnapshot: { ...base.sourceSnapshot, generationInputSnapshot: {
      ...base.sourceSnapshot.generationInputSnapshot!, window_days: windowDays,
    } },
  }, new Date().toISOString());
  await page.evaluate(async (document) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('motor-fluxo:app:v2:local:00000000-0000-4000-8000-000000000021');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('studies', 'readwrite');
        const { executions: _executions, ...stored } = document;
        void _executions;
        transaction.objectStore('studies').put({ study_id: document.id, owner_sub: document.ownerSub,
          deleted: 0, document: stored });
        transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  }, updated);
  return id;
}

export async function useDemoSamplingSeed(page: Page) {
  await page.evaluate(() => {
    const original = crypto.randomUUID.bind(crypto);
    let first = true;
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => {
      if (first) { first = false; return '00000000-0000-4000-8000-000000000111'; }
      return original();
    } });
  });
}
