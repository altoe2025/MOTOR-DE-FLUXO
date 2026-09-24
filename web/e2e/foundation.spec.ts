import { expect, test } from '@playwright/test';

test('browser executes the reference example through the real API and engine', async ({ page }) => {
  const calls = { get: 0, post: 0 };
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/examples/reference')) calls.get += 1;
    if (request.url().endsWith('/api/v1/previas')) calls.post += 1;
  });

  await page.goto('/');
  await expect(page).toHaveURL(/\/carteira$/);
  await page.getByLabel('Nome do estudo').fill('Validação MOT-22');

  const execute = page.getByRole('button', { name: 'Executar exemplo de referência' });
  await execute.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(execute).toBeEnabled({ timeout: 30_000 });

  await page.getByRole('link', { name: 'Diagnóstico' }).click();
  await expect(page.getByText('Prévia — uma execução')).toBeVisible();
  await expect(page.getByTestId('economia-brl')).toHaveText('R$ 1.026.000,00');
  await expect(page.getByTestId('netabilidade')).toHaveText('58,82%');
  await expect(page.getByText('Exemplo sintético de validação')).toBeVisible();
  await expect(page.getByText(/Valores não calibrados/)).toBeVisible();
  await expect(page.getByText('Fingerprint')).toBeVisible();

  await expect(page.getByRole('link', { name: 'Empresas' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Estudos' })).toBeVisible();
  await page.goto('/carteira');
  await expect(page).toHaveURL(/\/carteira$/);
  await expect(page.getByLabel('Nome do estudo')).toHaveValue('Validação MOT-22');
  expect(calls).toEqual({ get: 1, post: 1 });
});

test('production build, deep route and API share one origin', async ({ page, request }) => {
  await page.goto('/diagnostico');
  await expect(page).toHaveURL(/\/diagnostico$/);
  await expect(page.getByRole('heading', { name: 'Diagnóstico' })).toBeVisible();

  const health = await request.get('/api/v1/health');
  const missing = await request.get('/api/v1/unknown');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok' });
  expect(missing.status()).toBe(404);
  expect(missing.headers()['content-type']).toContain('application/json');
});

test('login, portfolio, preview and expired session remain usable at acceptance sizes', async ({ page }, testInfo) => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/carteira');
    await expect(page.getByRole('heading', { name: 'Carteira' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`carteira-${viewport.width}x${viewport.height}.png`), fullPage: true });
  }

  await page.goto('/carteira');
  await page.getByRole('button', { name: 'Executar exemplo de referência' }).click();
  await expect(page.getByRole('button', { name: 'Executar exemplo de referência' })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole('link', { name: 'Diagnóstico' }).click();
  await expect(page.getByTestId('economia-brl')).toHaveText('R$ 1.026.000,00');
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('group', { name: 'Autonetting — mesmo participante' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Netting multilateral — entre participantes' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Remetido — cruzou a fronteira' })).toBeVisible();
    await expect(page.getByText(/Valores não calibrados/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`diagnostico-${viewport.width}x${viewport.height}.png`), fullPage: true });
  }

  await page.evaluate(() => { document.documentElement.style.zoom = '200%'; });
  await expect(page.getByRole('group', { name: 'Autonetting — mesmo participante' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Netting multilateral — entre participantes' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Remetido — cruzou a fronteira' })).toBeVisible();
  await expect(page.getByText(/Valores não calibrados/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('diagnostico-zoom-200.png'), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });

  await page.goto('/carteira');
  await page.evaluate(() => { document.documentElement.style.zoom = '200%'; });
  await expect(page.getByRole('button', { name: 'Executar exemplo de referência' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('carteira-zoom-200.png'), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('login-1280x800.png'), fullPage: true });

  await page.evaluate(() => localStorage.setItem('motor-fluxo:e2e-session', 'expired'));
  await page.goto('/carteira');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(/Sua sessão expirou/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('sessao-expirada-1280x800.png'), fullPage: true });
});
