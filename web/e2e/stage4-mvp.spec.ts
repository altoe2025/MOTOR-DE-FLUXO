import { expect, test, type Page } from '@playwright/test';

const OBSERVED_STUDY = '00000000-0000-4000-8000-000000000901';
const PROFILE_STUDY = '00000000-0000-4000-8000-000000000902';
test.setTimeout(60_000);
const AXES = [
  '1. Potencial estrutural', '2. Captura pela política',
  '3. Compatibilidade temporal', '4. Exposição residual',
  '5. Dependência da composição', '6. Robustez econômica',
  '7. Perfil operacional da carteira',
] as const;

async function release(page: Page, count: number, submittedBefore: number) {
  for (let index = 0; index < count; index += 1) {
    await expect.poll(async () => (await page.request.get('/__e2e__/diagnostics/state')).json())
      .toMatchObject({ pending: 1, submitted: submittedBefore + index + 1 });
    const response = await page.request.post('/__e2e__/diagnostics/release', { data: { fail: false } });
    if (!response.ok()) {
      throw new Error(`Falha ao liberar repetição ${index + 1}/${count}: HTTP ${response.status()} ${await response.text()}`);
    }
  }
}

async function runDiagnostic(page: Page, studyId: string, scenarioId: string, repetitions: number) {
  await page.goto(`/estudos/${studyId}/diagnostico?scenarioId=${scenarioId}`);
  await expect(page.getByRole('heading', { name: 'Diagnóstico robusto' })).toBeFocused();
  const persistedBefore = await page.evaluate(
    (id) => window.__MOTOR_E2E__!.stage4Snapshot(id), studyId,
  );
  const state = await (await page.request.get('/__e2e__/diagnostics/state')).json() as { submitted: number };
  await page.getByRole('button', { name: 'Executar diagnóstico' }).click();
  await release(page, repetitions, state.submitted);
  await expect(page.getByRole('heading', { name: 'Resultado do motor' })).toBeVisible();
  await expect.poll(async () => (await page.evaluate(
    (id) => window.__MOTOR_E2E__!.stage4Snapshot(id), studyId,
  )).diagnosticExecutionIds.length, { timeout: 15_000 })
    .toBe(persistedBefore.diagnosticExecutionIds.length + 2);
}

async function compareScenarios(page: Page, studyId: string, expectedInput: string) {
  await page.goto(`/comparar?studyId=${studyId}`);
  await expect(page.getByRole('heading', { name: 'Comparar cenários' })).toBeFocused();
  await page.getByLabel('Execução base').selectOption({ index: 1 });
  await page.getByLabel('Execução da hipótese').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Comparar' }).click();
  await expect(page.getByRole('region', { name: 'Entradas alteradas' })
    .getByText(expectedInput, { exact: true })).toBeVisible();
  await expect(page.getByText(/diagnósticos independentes/i)).toBeVisible();
  const headings = await page.locator('.comparison-axis > h2').allTextContents();
  expect(headings).toEqual(AXES);
}

test('carteira observada preserva ordens ao criar hipótese de janela', async ({ page }) => {
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  await page.evaluate(() => window.__MOTOR_E2E__!.seedStage4('OBSERVED_HYPOTHESIS'));
  await page.goto(`/carteira/${OBSERVED_STUDY}`);

  await expect(page.getByText('Dados observados')).toBeVisible();
  const hypothesis = page.getByRole('region', { name: 'Criar hipótese' });
  await hypothesis.getByLabel('Nome da hipótese').fill('Hipótese janela 3 dias');
  await hypothesis.getByLabel('Janela em dias').fill('3');
  await hypothesis.getByRole('button', { name: 'Criar hipótese' }).click();
  await expect(page).toHaveURL(new RegExp(`/estudos/${OBSERVED_STUDY}/diagnostico\\?scenarioId=`));

  const persisted = await page.evaluate((id) => window.__MOTOR_E2E__!.stage4Snapshot(id), OBSERVED_STUDY);
  expect(persisted.scenarios).toHaveLength(2);
  expect(persisted.scenarios[0]!.orderFingerprint).toBe(persisted.scenarios[1]!.orderFingerprint);
  expect(persisted.scenarios[0]!.provenanceFingerprint).toBe(persisted.scenarios[1]!.provenanceFingerprint);
  expect(persisted.sourceLabels).toEqual(['Dados observados', 'Dados observados']);

  await runDiagnostic(page, OBSERVED_STUDY, persisted.scenarios[1]!.id, 1);
  await runDiagnostic(page, OBSERVED_STUDY, persisted.baseScenarioId, 1);
  await compareScenarios(page, OBSERVED_STUDY, 'Janela');
  await expect(page.getByText('Dados observados')).toBeVisible();
});

test('dois Perfis geram uma simulação separada e uma hipótese de mix', async ({ page }) => {
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  await page.evaluate(() => window.__MOTOR_E2E__!.seedStage4('PROFILE_HYPOTHESIS'));
  await page.goto(`/carteira/${PROFILE_STUDY}`);

  for (const company of ['stage4-company-a', 'stage4-company-b']) {
    await page.getByRole('checkbox', { name: new RegExp(company) }).check();
    const group = page.getByRole('group', { name: company, exact: true });
    await group.getByLabel('Finalidade OUT').fill('ANEXO_V_REMESSA_TERCEIRO');
    await group.getByLabel('Finalidade IN').fill('ANEXO_V_DISPONIBILIDADE');
  }
  await page.getByRole('button', { name: 'Preparar simulação por Perfil' }).click();
  await expect.poll(() => page.url()).not.toContain(PROFILE_STUDY);
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);
  const createdStudy = page.url().split('/').at(-1)!;
  expect(createdStudy).not.toBe(PROFILE_STUDY);
  await expect(page.getByText('Simulação baseada em Perfil')).toBeVisible();

  const hypothesis = page.getByRole('region', { name: 'Criar hipótese de composição' });
  await hypothesis.getByLabel('Nome da hipótese').fill('Hipótese de mix');
  await hypothesis.getByLabel(/Fração OUT — stage4-company-a/).fill('0.5');
  await hypothesis.getByRole('button', { name: 'Criar hipótese' }).click();
  await expect(page).toHaveURL(new RegExp(`/estudos/${createdStudy}/diagnostico\\?scenarioId=`));

  const persisted = await page.evaluate((id) => window.__MOTOR_E2E__!.stage4Snapshot(id), createdStudy);
  expect(persisted.scenarios).toHaveLength(2);
  expect(new Set(persisted.profileLineage.map((item) => item.profileId))).toEqual(new Set(['stage4-profile-a', 'stage4-profile-b']));
  expect(persisted.sourceLabels).toEqual(['Simulação baseada em Perfil', 'Simulação baseada em Perfil']);

  await runDiagnostic(page, createdStudy, persisted.scenarios[1]!.id, 10);
  await runDiagnostic(page, createdStudy, persisted.baseScenarioId, 10);
  await expect.poll(async () => (await page.evaluate(
    (id) => window.__MOTOR_E2E__!.stage4Snapshot(id), createdStudy,
  )).diagnosticExecutionIds.length, { timeout: 15_000 }).toBe(4);
  await compareScenarios(page, createdStudy, 'Mix OUT/IN');
  await expect(page.getByText('Simulação baseada em Perfil')).toBeVisible();

  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await expect(page.getByRole('region', { name: 'Tabela rolável — 1. Potencial estrutural' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
