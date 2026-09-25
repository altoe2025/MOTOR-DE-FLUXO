import { expect, test } from '@playwright/test';
import { expectCanonicalPreview, persistedPreviews } from './helpers/persistedPreview';

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
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);
  await page.getByRole('radio', { name: 'Caso observado' }).check();
  await page.getByLabel('Caso confirmado').selectOption('case-e2e');
  await expect(page.getByRole('heading', { name: 'Empresa anonimizada' })).toBeVisible();
  await page.getByRole('button', { name: 'Usar caso confirmado' }).click();
  const studyId = page.url().split('/').at(-1)!;
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), studyId))
    .toBe('OBSERVED_CASE');

  await page.getByRole('button', { name: 'Executar cenário atual' }).click();
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studyExecutionStatuses(id), studyId))
    .toContain('SUCCEEDED');
  const observed = await expectCanonicalPreview(page, studyId);
  expect(observed.sourceSnapshot?.source.kind).toBe('OBSERVED_CASE');
  expect(observed.observedComparison?.rows).toContainEqual(expect.objectContaining({
    code: 'GROSS_OUT_BRL', status: 'MATCHED', observedValue: '100', difference: '0',
  }));
  expect(Number(observed.envelope!.result.agregado.volume_bruto_periodo_brl)).toBe(100);

  await page.reload();
  await expect(page.getByRole('radio', { name: 'Caso observado' })).toBeChecked();
  await expect(page.getByLabel('Caso confirmado')).toHaveValue('case-e2e');
  expect(await persistedPreviews(page, studyId)).toEqual([observed]);

  await page.getByRole('button', { name: 'Converter para autoria manual' }).click();
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), studyId))
    .toBe('AUTHORED');
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studyExecutionStatuses(id), studyId))
    .toEqual(['RUNNING', 'SUCCEEDED']);
  await expect.poll(async () => (await persistedPreviews(page, studyId)).length).toBe(1);
  expect((await persistedPreviews(page, studyId))[0]!.status).toBe('SUCCEEDED');

  await page.evaluate(() => { document.documentElement.style.zoom = '200%'; });
  await expect(page.getByRole('heading', { name: 'Resultado do estudo', exact: true })).toBeVisible();
  expect(await persistedPreviews(page, studyId)).toEqual([observed]);
  await page.screenshot({ path: testInfo.outputPath('observed-study-zoom-200.png'), fullPage: true });
  const network = JSON.stringify(requests);
  expect(network).not.toContain('arquivo-bruto-secreto.xlsx');
  expect(requests.every(({ url }) => !/[?&](?:token|access_token)=/i.test(url))).toBe(true);
});
