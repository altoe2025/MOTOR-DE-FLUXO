import { expect, type Page } from '@playwright/test';
import Decimal from 'decimal.js';

import type { PreviewExecutionRecord } from '../../src/study/model';

/** Read the browser's actual publication; do not reconstruct a result from its input. */
export async function persistedPreviews(page: Page, studyId: string): Promise<PreviewExecutionRecord[]> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('motor-fluxo:app:v2:local:00000000-0000-4000-8000-000000000021');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<PreviewExecutionRecord[]>((resolve, reject) => {
        const request = db.transaction('executions').objectStore('executions').getAll();
        request.onsuccess = () => resolve(request.result
          .filter((row: { study_id: string; document: PreviewExecutionRecord }) =>
            row.study_id === id && row.document.kind === 'PREVIEW' && row.document.status === 'SUCCEEDED')
          .sort((left: { sequence: number }, right: { sequence: number }) => left.sequence - right.sequence)
          .map((row: { document: PreviewExecutionRecord }) => row.document));
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, studyId);
}

export async function expectCanonicalPreview(page: Page, studyId: string, count = 1) {
  await expect.poll(async () => (await persistedPreviews(page, studyId)).length, { timeout: 30_000 }).toBe(count);
  const execution = (await persistedPreviews(page, studyId)).at(-1)!;
  expect(execution.envelope).not.toBeNull();
  const aggregate = execution.envelope!.result.agregado;
  const inputVolume = execution.requestSnapshot.cenario.ordens.reduce(
    (total, order) => total.plus(order.valor_brl), new Decimal(0));
  expect(new Decimal(aggregate.volume_bruto_periodo_brl).equals(inputVolume)).toBe(true);
  expect(new Decimal(aggregate.volume_casado_periodo_brl).plus(aggregate.volume_remetido_periodo_brl)
    .equals(aggregate.volume_bruto_periodo_brl)).toBe(true);
  expect(new Decimal(aggregate.baseline_periodo.total).minus(aggregate.netado_periodo.total)
    .equals(aggregate.economia_periodo_brl)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Resultado do estudo', exact: true })).toBeVisible();
  return execution;
}
