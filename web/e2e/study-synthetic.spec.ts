import { expect, test } from '@playwright/test';

test('synthetic and manual portfolios use the preparation service and persist after reload', async ({ page }) => {
  const preparations: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/preparacoes')) preparations.push(request.postData() ?? '');
  });

  await page.goto('/estudos');
  await page.getByRole('button', { name: 'Novo estudo' }).click();
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);

  await page.getByLabel('Escolha do exemplo sintético').selectOption('exportadores');
  await page.getByRole('button', { name: 'Preparar exemplo' }).click();
  const studyId = page.url().split('/').at(-1)!;
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), studyId))
    .toBe('SYNTHETIC:exportadores');
  await page.getByRole('button', { name: 'Executar cenário atual' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado do motor' })).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Exemplo sintético' })).toBeChecked();
  await expect(page.getByLabel('Escolha do exemplo sintético')).toHaveValue('exportadores');
  await expect(page.getByRole('heading', { name: 'Resultado do motor' })).toBeVisible();

  await page.getByRole('radio', { name: 'Autoria manual' }).check();
  await page.getByLabel('Nome do grupo').fill('Nome local que não cruza a rede');
  await page.getByRole('button', { name: 'Preparar carteira manual' }).click();
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), studyId))
    .toBe('AUTHORED');
  await page.getByRole('button', { name: 'Executar cenário atual' }).click();
  await expect(page.getByRole('button', { name: /Abrir execução/ })).toHaveCount(2, { timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Autoria manual' })).toBeChecked();
  await expect(page.getByRole('button', { name: /Abrir execução/ })).toHaveCount(2);

  expect(preparations.length).toBeGreaterThanOrEqual(3);
  expect(preparations.every((body) => !body.includes('Nome local que não cruza a rede'))).toBe(true);
  for (const body of preparations) {
    const document = JSON.parse(body) as { input: { sources: Record<string, { kind: string }> } };
    expect(Object.values(document.input.sources).every((source) =>
      source.kind === 'PADRAO_SINTETICO' || source.kind === 'ESTIMATIVA_USUARIO')).toBe(true);
  }
});
