import { expect, test } from '@playwright/test';

test.afterAll(async ({ request }) => {
  const response = await request.post('/__e2e__/shutdown');
  expect(response.ok()).toBe(true);
  await expect.poll(async () => {
    try {
      await request.get('/api/v1/health');
      return false;
    } catch {
      return true;
    }
  }).toBe(true);
});

test('browser executes the reference example through the real API and engine', async ({ page }) => {
  const calls = { get: 0, post: 0 };
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/examples/reference')) calls.get += 1;
    if (request.url().endsWith('/api/v1/previas')) calls.post += 1;
  });

  await page.goto('/');
  await expect(page).toHaveURL(/\/carteira$/);
  await page.getByLabel('Nome do estudo').fill('Validação MOT-21');

  const execute = page.getByRole('button', { name: 'Executar exemplo de referência' });
  await execute.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(execute).toBeEnabled({ timeout: 30_000 });

  await page.getByRole('link', { name: 'Diagnóstico' }).click();
  await expect(page.getByTestId('economia-brl')).toHaveText('R$ 1.026.000,00');
  await expect(page.getByTestId('netabilidade')).toHaveText('58,82%');
  await expect(page.getByText('Exemplo sintético de validação')).toBeVisible();
  await expect(page.getByText(/Valores não calibrados/)).toBeVisible();
  await expect(page.getByText('Fingerprint')).toBeVisible();

  await page.getByRole('link', { name: 'Carteira' }).click();
  await expect(page.getByLabel('Nome do estudo')).toHaveValue('Validação MOT-21');
  expect(calls).toEqual({ get: 1, post: 1 });
});
