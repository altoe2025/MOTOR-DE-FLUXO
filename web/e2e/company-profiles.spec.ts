import { expect, test, type Page } from '@playwright/test';

const OWNER = '00000000-0000-4000-8000-000000000021';
const OWNER_B = '00000000-0000-4000-8000-000000000022';
const NOW = '2026-09-20T12:00:00Z';

async function seedCase(page: Page, suffix: string, startDate: string, endDate: string) {
  await page.evaluate(async ({ owner, now, suffix, startDate, endDate }) => {
    const provenance = { kind: 'OBSERVED' as const, source: 'fixture anonimizada T11', version: '1', recordedAt: now };
    await window.__MOTOR_E2E__!.seedObservedCase(
      { id: 'company-t11', ownerSub: owner, displayName: 'Empresa T11', aliases: [], createdAt: now, updatedAt: now, revision: 1 },
      {
        schemaVersion: '2.0.0', id: `case-${suffix}`, ownerSub: owner, companyId: 'company-t11',
        status: 'CONFIRMED', revision: 1,
        window: { startDate, endDate, closingDate: endDate },
        orders: [{ id: `order-${suffix}`, clientId: `client-${suffix}`, direction: suffix === 'a' ? 'OUT' : 'IN', knownDate: startDate, deadlineDate: endDate, valueBrl: suffix === 'a' ? '100' : '70', purposeCode: 'ANEXO_V_REMESSA_TERCEIRO', efxStatus: 'YES', provenance: [provenance] }],
        controlTotals: [{ code: suffix === 'a' ? 'GROSS_OUT_BRL' : 'GROSS_IN_BRL', valueBrl: suffix === 'a' ? '100' : '70', provenance }],
        sourceManifest: { adapterId: 'e2e', adapterVersion: '1', sourceKind: 'XLSX', files: [{ name: `anon-${suffix}.xlsx`, sizeBytes: 10, sha256: suffix.repeat(64) }] },
        normalization: { rulesetId: 'e2e', rulesetVersion: '1', normalizedAt: now },
        quality: { blockers: [], warnings: [] }, corrections: [], observedOutcome: null, confirmedAt: now,
      },
    );
  }, { owner: OWNER, now: NOW, suffix, startDate, endDate });
}

async function createStudy(page: Page): Promise<string> {
  await page.goto('/estudos');
  await page.getByRole('button', { name: 'Novo estudo', exact: true }).click();
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);
  return page.url().split('/').at(-1)!;
}

test('Empresa para Perfil para Estudo preserves the v1 snapshot after v2', async ({ page }) => {
  const studyId = await createStudy(page);
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  await seedCase(page, 'a', '2026-01-01', '2026-01-31');
  await seedCase(page, 'b', '2026-02-01', '2026-02-28');

  await page.goto('/empresas/company-t11/casos?inicio=2026-02-01&fim=2026-02-28');
  await expect(page.getByRole('row', { name: /2026-02-01 a 2026-02-28/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /2026-01-01 a 2026-01-31/ })).toHaveCount(0);

  await page.goto('/empresas/company-t11/perfis');
  await page.getByRole('checkbox', { name: /case-a/ }).check();
  await expect(page.getByRole('region', { name: 'Prévia do Perfil Operacional' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar versão' }).click();
  await expect(page.getByRole('status')).toContainText('Versão 1 confirmada');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Versão 1' })).toBeVisible();
  await page.getByLabel('Estudo para receber a evidência').selectOption(studyId);
  await page.getByRole('button', { name: 'Usar como evidência em estudo' }).click();
  await expect(page.getByRole('status')).toContainText('Perfil v1 anexado');

  await page.reload();
  await page.getByRole('checkbox', { name: /case-a/ }).check();
  await page.getByRole('checkbox', { name: /case-b/ }).check();
  await page.getByRole('button', { name: 'Confirmar versão' }).click();
  await expect(page.getByRole('status')).toContainText('Versão 2 confirmada');

  const persisted = await page.evaluate((id) => window.__MOTOR_E2E__!.profileSnapshot(id), studyId);
  expect(persisted).toEqual({ attachedVersions: [1], availableVersions: [1, 2] });
  const hidden = await page.evaluate(
    ({ id, ownerSub }) => window.__MOTOR_E2E__!.profileSnapshot(id, ownerSub),
    { id: studyId, ownerSub: OWNER_B },
  );
  expect(hidden).toEqual({ attachedVersions: [], availableVersions: [] });
});

test('two tabs race for one profile version and CAS stores only one', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:8021' });
  const first = await context.newPage();
  await first.goto('/estudos');
  await first.waitForFunction(() => '__MOTOR_E2E__' in window);
  await seedCase(first, 'a', '2026-01-01', '2026-01-31');
  const second = await context.newPage();
  await Promise.all([first.goto('/empresas/company-t11/perfis'), second.goto('/empresas/company-t11/perfis')]);
  await Promise.all([
    first.getByRole('checkbox', { name: /case-a/ }).check(),
    second.getByRole('checkbox', { name: /case-a/ }).check(),
  ]);
  await Promise.all([
    expect(first.getByRole('region', { name: 'Prévia do Perfil Operacional' })).toBeVisible(),
    expect(second.getByRole('region', { name: 'Prévia do Perfil Operacional' })).toBeVisible(),
  ]);
  await Promise.all([
    first.getByRole('button', { name: 'Confirmar versão' }).click(),
    second.getByRole('button', { name: 'Confirmar versão' }).click(),
  ]);
  await expect.poll(() => first.evaluate(() => window.__MOTOR_E2E__!.profileVersions('company-t11')))
    .toEqual([1]);
  await context.close();
});
