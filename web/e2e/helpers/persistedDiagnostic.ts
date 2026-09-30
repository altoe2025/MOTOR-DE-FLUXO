import { expect, type Page } from '@playwright/test';
import Decimal from 'decimal.js';
import type { DiagnosticExecutionRecord } from '../../src/study/model';

export async function persistedDiagnostics(page: Page, studyId: string): Promise<DiagnosticExecutionRecord[]> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('motor-fluxo:app:v2:local:00000000-0000-4000-8000-000000000021');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<DiagnosticExecutionRecord[]>((resolve, reject) => {
        const request = db.transaction('executions').objectStore('executions').getAll();
        request.onsuccess = () => resolve(request.result
          .filter((row: { study_id: string; document: DiagnosticExecutionRecord }) =>
            row.study_id === id && row.document.kind === 'DIAGNOSTIC' && row.document.status === 'SUCCEEDED')
          .sort((left: { sequence: number }, right: { sequence: number }) => left.sequence - right.sequence)
          .map((row: { document: DiagnosticExecutionRecord }) => row.document));
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, studyId);
}

/** Drive the current UI and controlled real engine; read its persisted publication. */
export async function runCanonicalDiagnostic(page: Page, studyId: string, scenarioId?: string) {
  const previous = (await persistedDiagnostics(page, studyId)).length;
  await page.goto(`/estudos/${studyId}/diagnostico${scenarioId === undefined ? '' : `?scenarioId=${scenarioId}`}`);
  await expect(page.getByRole('heading', { name: /^Diagnóstico(?: robusto)?$/, level: 1 })).toBeVisible();
  const submitted = page.waitForRequest((request) => request.url().endsWith('/api/v1/diagnosticos')
    && request.method() === 'POST');
  await page.getByRole('button', { name: 'Executar diagnóstico', exact: true }).click();
  const request = (await submitted).postDataJSON() as { sampling: { count: number } };
  for (let index = 0; index < request.sampling.count; index += 1) {
    await expect.poll(async () => (await page.request.get('/__e2e__/diagnostics/state')).json())
      .toMatchObject({ pending: 1 });
    expect((await page.request.post('/__e2e__/diagnostics/release', { data: { fail: false } })).ok()).toBe(true);
  }
  await expect.poll(async () => (await persistedDiagnostics(page, studyId)).length).toBe(previous + 1);
  await expect(page.getByRole('heading', { name: 'Resultado do motor', exact: true })).toBeVisible();
  const execution = (await persistedDiagnostics(page, studyId)).at(-1)!;
  expect(execution.envelope).not.toBeNull();
  const selected = execution.envelope!.selected_execution;
  const aggregate = selected.result.agregado;
  const volume = selected.input_snapshot.cenario!.ordens.reduce(
    (total, order) => total.plus(order.valor_brl), new Decimal(0));
  expect(new Decimal(aggregate.volume_bruto_periodo_brl).equals(volume)).toBe(true);
  expect(new Decimal(aggregate.volume_casado_periodo_brl).plus(aggregate.volume_remetido_periodo_brl)
    .equals(aggregate.volume_bruto_periodo_brl)).toBe(true);
  expect(new Decimal(aggregate.baseline_periodo.total).minus(aggregate.netado_periodo.total)
    .equals(aggregate.economia_periodo_brl)).toBe(true);
  return execution;
}
