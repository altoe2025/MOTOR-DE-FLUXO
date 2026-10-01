import { expect, test, type Page } from '@playwright/test';
import Decimal from 'decimal.js';
import { persistedDiagnostics, runCanonicalDiagnostic } from './helpers/persistedDiagnostic';

async function createGeneratedStudy(page: Page): Promise<string> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/estudos$/);
  await page.getByRole('button', { name: 'Novo estudo', exact: true }).click();
  await page.getByRole('radio', { name: 'Carteira gerada (exemplo)' }).check();
  await page.getByRole('button', { name: 'Criar com carteira gerada' }).click();
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);
  return page.url().split('/').at(-1)!;
}

test('browser executes a generated study through the real API and engine exactly once', async ({ page }) => {
  const calls = { prepare: 0, diagnose: 0 };
  page.on('request', (request) => {
    if (request.method() !== 'POST') return;
    if (request.url().endsWith('/api/v1/preparacoes')) calls.prepare += 1;
    if (request.url().endsWith('/api/v1/diagnosticos')) calls.diagnose += 1;
  });
  const studyId = await createGeneratedStudy(page);
  await page.getByLabel('Nome do estudo', { exact: true }).fill('Validação MOT-22');
  await page.getByRole('button', { name: 'Salvar nome', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Validação MOT-22', exact: true })).toBeVisible();
  await expect(page.getByText('Alterações salvas.', { exact: true })).toBeVisible();
  await page.goto(`/estudos/${studyId}/diagnostico`);
  const execute = page.getByRole('button', { name: 'Executar diagnóstico', exact: true });
  await execute.evaluate((button) => { button.click(); button.click(); });
  for (let index = 0; index < 10; index += 1) {
    await expect.poll(async () => (await page.request.get('/__e2e__/diagnostics/state')).json())
      .toMatchObject({ pending: 1 });
    expect((await page.request.post('/__e2e__/diagnostics/release', { data: { fail: false } })).ok()).toBe(true);
  }
  await expect(page.getByRole('heading', { name: 'Resultado do motor', exact: true })).toBeVisible();
  const executions = await persistedDiagnostics(page, studyId);
  expect(executions).toHaveLength(1);
  const execution = executions[0]!;
  expect(execution.sourceSnapshot.source.kind).toBe('SYNTHETIC');
  const aggregate = execution.envelope!.selected_execution.result.agregado;
  expect(new Decimal(aggregate.volume_casado_periodo_brl).plus(aggregate.volume_remetido_periodo_brl)
    .eq(aggregate.volume_bruto_periodo_brl)).toBe(true);
  expect(new Decimal(aggregate.baseline_periodo.total).minus(aggregate.netado_periodo.total)
    .eq(aggregate.economia_periodo_brl)).toBe(true);
  await expect(page.getByTestId('economia-brl')).toBeVisible();
  await expect(page.getByTestId('netabilidade')).toBeVisible();
  await expect(page.getByText(/não é probabilidade de desempenho futuro/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Empresas', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Estudos', exact: true })).toBeVisible();
  await page.goto(`/carteira/${studyId}`);
  await expect(page.getByLabel('Nome do estudo', { exact: true })).toHaveValue('Validação MOT-22');
  await expect(page.getByRole('button', { name: 'Abrir diagnóstico', exact: true })).toBeVisible();
  await page.goto(`/estudos/${studyId}/diagnostico`);
  await expect(page.getByRole('heading', { name: 'Resultado do motor', exact: true })).toBeVisible();
  expect(await persistedDiagnostics(page, studyId)).toEqual(executions);
  expect(calls).toEqual({ prepare: 1, diagnose: 1 });
});

test('production build, deep route and API share one origin', async ({ page, request }) => {
  await page.goto('/diagnostico');
  await expect(page).toHaveURL(/\/diagnostico$/);
  await expect(page.getByRole('heading', { name: 'Diagnóstico', exact: true })).toBeVisible();
  const health = await request.get('/api/v1/health');
  const missing = await request.get('/api/v1/unknown');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok' });
  expect(missing.status()).toBe(404);
  expect(missing.headers()['content-type']).toContain('application/json');
});

test('login, study, diagnostic and expired session remain usable at acceptance sizes', async ({ page }, testInfo) => {
  const studyId = await createGeneratedStudy(page);
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('button', { name: 'Executar diagnóstico', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`carteira-${viewport.width}x${viewport.height}.png`), fullPage: true });
  }
  await runCanonicalDiagnostic(page, studyId);
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('group', { name: 'Autonetting — mesmo participante' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Netting multilateral — entre participantes' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Remetido — cruzou a fronteira' })).toBeVisible();
    await expect(page.getByText(/não é probabilidade de desempenho futuro/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`diagnostico-${viewport.width}x${viewport.height}.png`), fullPage: true });
  }
  await page.evaluate(() => { document.documentElement.style.zoom = '200%'; });
  await expect(page.getByRole('group', { name: 'Autonetting — mesmo participante' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Netting multilateral — entre participantes' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Remetido — cruzou a fronteira' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('diagnostico-zoom-200.png'), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  await page.goto(`/carteira/${studyId}`);
  await page.evaluate(() => { document.documentElement.style.zoom = '200%'; });
  await expect(page.getByRole('button', { name: 'Abrir diagnóstico', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('carteira-zoom-200.png'), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('login-1280x800.png'), fullPage: true });
  await page.evaluate(() => localStorage.setItem('motor-fluxo:e2e-session', 'expired'));
  await page.goto('/estudos');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(/Sua sessão expirou/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('sessao-expirada-1280x800.png'), fullPage: true });
});
