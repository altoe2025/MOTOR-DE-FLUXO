import { expect, test } from '@playwright/test';
import { runCanonicalDiagnostic, persistedDiagnostics } from './helpers/persistedDiagnostic';

const OWNER = '00000000-0000-4000-8000-000000000021';
const NOW = '2026-09-19T12:00:00Z';

test('confirmed observed case becomes an immutable study snapshot and survives reload', async ({ page }, testInfo) => {
  const requests: Array<{ url: string; body: string | null }> = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) requests.push({ url: request.url(), body: request.postData() });
  });
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  await page.evaluate(async ({ owner, now }) => {
    const provenance = { kind: 'OBSERVED' as const, source: 'fonte anonimizada', version: '1', recordedAt: now };
    const observedCase = {
      schemaVersion: '2.0.0' as const, id: 'case-e2e', ownerSub: owner, companyId: 'company-e2e',
      status: 'CONFIRMED' as const, revision: 1,
      window: { startDate: '2026-09-01', endDate: '2026-09-30', closingDate: '2026-09-30' },
      orders: [{ id: 'observed-order-1', clientId: 'client-anon', direction: 'OUT' as const, knownDate: '2026-09-01', deadlineDate: '2026-09-03', valueBrl: '100', purposeCode: 'ANEXO_V_REMESSA_TERCEIRO', efxStatus: 'YES' as const, provenance: [provenance] }],
      controlTotals: [{ code: 'GROSS_OUT_BRL' as const, valueBrl: '100', provenance }],
      sourceManifest: { adapterId: 'e2e', adapterVersion: '1', sourceKind: 'XLSX', files: [{ name: 'arquivo-bruto-secreto.xlsx', sizeBytes: 10, sha256: 'a'.repeat(64) }] },
      normalization: { rulesetId: 'e2e', rulesetVersion: '1', normalizedAt: now },
      quality: { blockers: [], warnings: [] }, corrections: [],
      observedOutcome: { schemaVersion: '1.0.0' as const, metrics: [{ code: 'GROSS_OUT_BRL' as const, value: '100', unit: 'BRL' as const, definitionVersion: '1.0.0', provenance }] },
      confirmedAt: now,
    };
    const company = { id: 'company-e2e', ownerSub: owner, displayName: 'Empresa anonimizada', aliases: [], createdAt: now, updatedAt: now, revision: 1 };
    await window.__MOTOR_E2E__!.seedObservedCase(company, observedCase);
  }, { owner: OWNER, now: NOW });
  await page.reload();
  await page.getByRole('button', { name: 'Novo estudo' }).click();
  await page.getByRole('radio', { name: 'Carteira gerada (exemplo)' }).check();
  await page.getByRole('button', { name: 'Criar com carteira gerada' }).click();
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);
  await page.getByRole('button', { name: 'Trocar origem' }).click();
  await page.getByRole('radio', { name: 'Dados importados de uma empresa' }).check();
  await page.getByLabel('Caso importado').selectOption('case-e2e');
  await expect(page.getByRole('heading', { name: 'Empresa anonimizada' })).toBeVisible();
  await page.getByRole('button', { name: 'Usar este caso' }).click();
  const studyId = page.url().split('/').at(-1)!;
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), studyId))
    .toBe('OBSERVED_CASE');

  const observed = await runCanonicalDiagnostic(page, studyId);
  expect(observed.sourceSnapshot?.source.kind).toBe('OBSERVED_CASE');
  // Diagnostics preserve the observed evidence in the immutable source snapshot.
  const grossOut = observed.sourceSnapshot.observedOutcome!.metrics.find((metric) => metric.code === 'GROSS_OUT_BRL')!;
  expect(grossOut.value).toBe('100');
  expect(Number(observed.envelope!.selected_execution.result.agregado.volume_bruto_periodo_brl)).toBe(Number(grossOut.value));

  await page.goto(`/carteira/${studyId}`);
  await page.reload();
  await page.getByRole('button', { name: 'Trocar origem' }).click();
  await expect(page.getByRole('radio', { name: 'Dados importados de uma empresa' })).toBeChecked();
  await expect(page.getByLabel('Caso importado')).toHaveValue('case-e2e');
  expect(await persistedDiagnostics(page, studyId)).toEqual([observed]);

  await page.getByRole('button', { name: 'Editar as ordens à mão' }).click();
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), studyId))
    .toBe('AUTHORED');
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studyExecutionStatuses(id), studyId))
    .toEqual(['QUEUED', 'SUCCEEDED']);
  await expect.poll(async () => (await persistedDiagnostics(page, studyId)).length).toBe(1);
  expect((await persistedDiagnostics(page, studyId))[0]!.status).toBe('SUCCEEDED');

  await page.evaluate(() => { document.documentElement.style.zoom = '200%'; });
  await expect(page.getByRole('button', { name: 'Mais ações: estudo' })).toBeVisible();
  expect(await persistedDiagnostics(page, studyId)).toEqual([observed]);
  await page.screenshot({ path: testInfo.outputPath('observed-study-zoom-200.png'), fullPage: true });
  const network = JSON.stringify(requests);
  expect(network).not.toContain('arquivo-bruto-secreto.xlsx');
  expect(requests.every(({ url }) => !/[?&](?:token|access_token)=/i.test(url))).toBe(true);
});
