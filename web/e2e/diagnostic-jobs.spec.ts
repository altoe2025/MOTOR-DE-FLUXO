import { expect, test, type Locator, type Page } from '@playwright/test';

const TOKEN_A = 'mot21-controlled-e2e-token';
const TOKEN_B = 'mot32-controlled-e2e-token-b';

async function createStudy(page: Page, synthetic = true): Promise<string> {
  await page.goto('/estudos');
  await page.getByRole('button', { name: 'Novo estudo', exact: true }).click();
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);
  if (!synthetic) {
    await page.getByRole('radio', { name: 'Autoria manual' }).check();
    await page.getByRole('button', { name: 'Preparar carteira manual' }).click();
  }
  return page.url().split('/').at(-1)!;
}

async function release(page: Page, fail = false) {
  await expect.poll(async () => (await page.request.get('/__e2e__/diagnostics/state')).json())
    .toMatchObject({ pending: 1 });
  const response = await page.request.post('/__e2e__/diagnostics/release', { data: { fail } });
  expect(response.ok()).toBe(true);
}

async function tabTo(page: Page, target: Locator, maximumTabs = 40) {
  for (let index = 0; index < maximumTabs; index += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
}

test('two controlled jobs expose progress, cancel, idempotency, isolation and reload', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:8021' });
  const first = await context.newPage();
  const second = await context.newPage();
  const firstStudy = await createStudy(first);
  const secondStudy = await createStudy(second);
  await Promise.all([
    first.goto(`/estudos/${firstStudy}/diagnostico`),
    second.goto(`/estudos/${secondStudy}/diagnostico`),
  ]);

  let firstBody = '';
  first.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/v1/diagnosticos')) firstBody = request.postData() ?? '';
  });
  await first.getByRole('button', { name: 'Executar diagnóstico' }).click();
  await second.getByRole('button', { name: 'Executar diagnóstico' }).click();
  await expect(first.getByRole('heading', { name: /Executando|Na fila/ })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'Na fila' })).toBeVisible();

  second.once('dialog', (dialog) => dialog.accept());
  await second.getByRole('button', { name: 'Cancelar diagnóstico' }).click();
  await expect(second.getByRole('heading', { name: 'Diagnóstico cancelado' })).toBeVisible();

  await release(first);
  await expect(first.getByRole('status')).toContainText('1 de 10');
  for (let index = 1; index < 10; index += 1) await release(first);
  await expect(first.getByRole('heading', { name: 'Diagnóstico concluído' })).toBeVisible();
  await expect(first.getByText('10 repetições', { exact: false })).toBeVisible();
  await expect(first.getByRole('heading', { name: 'Execução selecionada' })).toBeVisible();

  const submitted = JSON.parse(firstBody) as { idempotency_key: string };
  const repeated = await first.request.post('/api/v1/diagnosticos', {
    data: JSON.parse(firstBody), headers: { Authorization: `Bearer ${TOKEN_A}` },
  });
  expect(repeated.status()).toBe(202);
  expect((await repeated.json()).job_id).toBe(submitted.idempotency_key);
  const isolated = await first.request.get(`/api/v1/diagnosticos/${submitted.idempotency_key}`, {
    headers: { Authorization: `Bearer ${TOKEN_B}` },
  });
  expect(isolated.status()).toBe(404);

  await first.reload();
  await expect(first.getByRole('heading', { name: 'Diagnóstico concluído' })).toBeVisible();
  await expect(first.getByRole('table', { name: 'Histórico de tentativas diagnósticas' })).toContainText('SUCCEEDED');
  await context.close();
});

test('fixed input has no distribution and a failed generated repetition publishes no partial result', async ({ page }) => {
  const fixedStudy = await createStudy(page, false);
  await page.evaluate((id) => window.__MOTOR_E2E__!.freezeStudyInput(id), fixedStudy);
  await page.goto(`/estudos/${fixedStudy}/diagnostico`);
  await expect(page.getByText(/entrada fixa.*execução individual.*não uma distribuição/i)).toBeVisible();
  await page.getByRole('button', { name: 'Executar diagnóstico' }).click();
  await release(page);
  await expect(page.getByRole('heading', { name: 'Diagnóstico concluído' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Distribuição de repetições' }))
    .toContainText('Distribuição indisponível: FIXED_INPUT_HAS_NO_SAMPLING_DISTRIBUTION');

  const generatedStudy = await createStudy(page);
  await page.goto(`/estudos/${generatedStudy}/diagnostico`);
  await page.getByRole('button', { name: 'Executar diagnóstico' }).click();
  await release(page, true);
  await expect(page.getByRole('heading', { name: 'Falha no diagnóstico' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Distribuição|Execução selecionada/ })).toHaveCount(0);
});

test('robust diagnostic remains keyboard accessible at 200 percent zoom', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const studyId = await createStudy(page);
  await page.goto(`/estudos/${studyId}/diagnostico`);
  await page.evaluate(() => { document.documentElement.style.zoom = '200%'; });

  const repetitions = page.getByLabel('Repetições');
  await tabTo(page, repetitions);
  await expect(repetitions).toBeFocused();
  await page.keyboard.press('Tab');
  const runButton = page.getByRole('button', { name: 'Executar diagnóstico' });
  await expect(runButton).toBeFocused();
  const focusStyle = await runButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(focusStyle.style).not.toBe('none');
  expect(focusStyle.width).not.toBe('0px');
  await page.keyboard.press('Enter');

  for (let index = 0; index < 10; index += 1) await release(page);
  await expect(page.getByRole('heading', { name: 'Diagnóstico concluído' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Distribuição de repetições' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Execução selecionada' })).toBeVisible();
  await expect(page.getByRole('region', { name: /^\d\. / })).toHaveCount(7);

  const diagnosticScrollAreas = page.locator('.diagnostic-page .table-scroll');
  expect(await diagnosticScrollAreas.count()).toBeGreaterThan(0);
  expect(await diagnosticScrollAreas.evaluateAll((elements) => elements.every((element) => (
    element.getAttribute('tabindex') === '0' && (element.getAttribute('aria-label')?.length ?? 0) > 0
  )))).toBe(true);

  const scrollableTable = page.getByRole('region', {
    name: 'Tabela rolável — Economia por repetição — dados do gráfico',
  });
  await scrollableTable.scrollIntoViewIfNeeded();
  await tabTo(page, scrollableTable);
  await expect(scrollableTable).toBeFocused();
  const before = await scrollableTable.evaluate((element) => element.scrollLeft);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => scrollableTable.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);

  await page.screenshot({ path: testInfo.outputPath('diagnostico-robusto-zoom-200.png'), fullPage: true });
});
