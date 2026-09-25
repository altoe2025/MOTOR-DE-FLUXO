import { expect, test, type Page } from '@playwright/test';

const PROFILE_SEED_STUDY = '00000000-0000-4000-8000-000000000902';
test.setTimeout(90_000);

async function seedProfileStudy(page: Page): Promise<string> {
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  await page.evaluate(() => window.__MOTOR_E2E__!.seedStage4('PROFILE_HYPOTHESIS'));
  await page.goto(`/carteira/${PROFILE_SEED_STUDY}`);
  for (const company of ['stage4-company-a', 'stage4-company-b']) {
    await page.getByRole('checkbox', { name: new RegExp(company) }).check();
    const group = page.getByRole('group', { name: company, exact: true });
    await group.getByLabel('Finalidade OUT').fill('ANEXO_V_REMESSA_TERCEIRO');
    await group.getByLabel('Finalidade IN').fill('ANEXO_V_DISPONIBILIDADE');
  }
  await page.getByRole('button', { name: 'Preparar simulação por Perfil' }).click();
  await expect.poll(() => page.url()).not.toContain(PROFILE_SEED_STUDY);
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);
  return page.url().split('/').at(-1)!;
}

async function releaseDiagnostics(page: Page, count: number, submittedBefore: number) {
  for (let index = 0; index < count; index += 1) {
    await expect.poll(async () => (await page.request.get('/__e2e__/diagnostics/state')).json())
      .toMatchObject({ pending: 1, submitted: submittedBefore + index + 1 });
    await page.request.post('/__e2e__/diagnostics/release', { data: { fail: false } });
  }
}

async function runDiagnostic(page: Page, studyId: string, scenarioId: string) {
  await page.goto(`/estudos/${studyId}/diagnostico?scenarioId=${scenarioId}`);
  const before = await page.evaluate((id) => window.__MOTOR_E2E__!.stage4Snapshot(id), studyId);
  const state = await (await page.request.get('/__e2e__/diagnostics/state')).json() as { submitted: number };
  await page.getByRole('button', { name: 'Executar diagnóstico' }).click();
  await releaseDiagnostics(page, 10, state.submitted);
  await expect(page.getByRole('heading', { name: 'Resultado do motor' })).toBeVisible();
  await expect.poll(async () => (await page.evaluate(
    (id) => window.__MOTOR_E2E__!.stage4Snapshot(id), studyId,
  )).diagnosticExecutionIds.length, { timeout: 15_000 })
    .toBe(before.diagnosticExecutionIds.length + 2);
}

test('cria duas hipóteses, muda composição, executa, compara e recarrega', async ({ page }) => {
  const studyId = await seedProfileStudy(page);
  const builder = page.getByRole('region', { name: 'Criar hipótese de composição' });
  await builder.getByLabel('Nome da hipótese').fill('Troca B por C');
  await builder.getByLabel(/Volume mensal — stage4-company-a/).fill('800');
  await builder.getByLabel('Adicionar Perfil').selectOption('stage4-profile-c');
  await builder.getByRole('button', { name: 'Remover stage4-company-b', exact: true }).click();
  await builder.getByRole('button', { name: 'Criar hipótese' }).click();
  await expect(page).toHaveURL(new RegExp(`/estudos/${studyId}/diagnostico\\?scenarioId=`));

  await page.goto(`/carteira/${studyId}`);
  const second = page.getByRole('region', { name: 'Criar hipótese de composição' });
  await second.getByLabel('Nome da hipótese').fill('Finalidades alternativas');
  await second.getByLabel(/Finalidade OUT — stage4-company-a/).fill('SERVICOS');
  await second.getByLabel(/Finalidade IN — stage4-company-a/).fill('EXPORTACAO');
  await second.getByRole('button', { name: 'Criar hipótese' }).click();

  const snapshot = await page.evaluate((id) => window.__MOTOR_E2E__!.stage4Snapshot(id), studyId);
  expect(snapshot.scenarios.map((scenario) => scenario.name)).toEqual([
    'Cenário base por Perfil', 'Troca B por C', 'Finalidades alternativas',
  ]);
  const changed = snapshot.scenarios.find((scenario) => scenario.name === 'Troca B por C')!;
  await runDiagnostic(page, studyId, snapshot.baseScenarioId);
  await runDiagnostic(page, studyId, changed.id);

  await page.goto(`/comparar?studyId=${studyId}`);
  await page.getByLabel('Execução base').selectOption({ index: 1 });
  await page.getByLabel('Execução da hipótese').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Comparar' }).click();
  await expect(page.getByRole('heading', { name: 'Mudanças na composição' })).toBeVisible();
  await expect(page.getByText(/a composição mudou/i)).toBeVisible();
  await expect(page.getByText('Adicionado', { exact: true })).toBeVisible();
  await expect(page.getByText('Removido', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Execução base')).toHaveValue('');
  await expect(page.getByLabel('Execução da hipótese')).toHaveValue('');

  await page.goto(`/carteira/${studyId}`);
  await expect(page.getByText('Troca B por C', { exact: true })).toBeVisible();
  await expect(page.getByText('Finalidades alternativas', { exact: true })).toBeVisible();
  const reloaded = await page.evaluate((id) => window.__MOTOR_E2E__!.stage4Snapshot(id), studyId);
  expect(reloaded.scenarios).toHaveLength(3);
  expect(reloaded.profileLineage.map((item) => item.profileId)).toContain('stage4-profile-c');
  expect(reloaded.evidenceProfileIds).toEqual(expect.arrayContaining([
    'stage4-profile-a', 'stage4-profile-b', 'stage4-profile-c',
  ]));
  expect(reloaded.diagnosticExecutionIds).toHaveLength(4);

  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('conflito CAS mantém o rascunho da aba perdedora', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    class SilentBroadcastChannel { onmessage = null; postMessage() {} addEventListener() {} removeEventListener() {} close() {} }
    Object.defineProperty(window, 'BroadcastChannel', { value: SilentBroadcastChannel });
  });
  const winner = await context.newPage();
  const loser = await context.newPage();
  await winner.goto('/estudos');
  await winner.waitForFunction(() => '__MOTOR_E2E__' in window);
  await winner.evaluate(() => window.__MOTOR_E2E__!.seedStage4('OBSERVED_HYPOTHESIS'));
  await winner.goto('/carteira/00000000-0000-4000-8000-000000000901');
  await loser.goto(winner.url());
  const first = winner.getByRole('region', { name: 'Criar hipótese' });
  const second = loser.getByRole('region', { name: 'Criar hipótese' });
  await first.getByLabel('Nome da hipótese').fill('Vencedora');
  await first.getByLabel('Janela em dias').fill('3');
  await second.getByLabel('Nome da hipótese').fill('Rascunho preservado');
  await second.getByLabel('Janela em dias').fill('5');
  await first.getByRole('button', { name: 'Criar hipótese' }).click();
  await second.getByRole('button', { name: 'Criar hipótese' }).click();
  await expect(second.getByRole('alert')).toContainText(/outra aba|sessão mudou|revisão esperada/i);
  await expect(second.getByLabel('Nome da hipótese')).toHaveValue('Rascunho preservado');
  await expect(second.getByLabel('Janela em dias')).toHaveValue('5');
  await expect(second.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await context.close();
});
