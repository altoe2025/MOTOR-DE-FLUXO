import { expect, test } from '@playwright/test';
import { runCanonicalDiagnostic, persistedDiagnostics } from './helpers/persistedDiagnostic';

test('synthetic and manual portfolios use the preparation service and persist after reload', async ({ page }) => {
  const preparations: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/preparacoes')) preparations.push(request.postData() ?? '');
  });

  await page.goto('/estudos');
  await page.getByRole('button', { name: 'Novo estudo' }).click();
  await page.getByRole('radio', { name: 'Carteira gerada (exemplo)' }).check();
  await page.getByRole('button', { name: 'Criar com carteira gerada' }).click();
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);

  await page.getByRole('button', { name: 'Trocar origem' }).click();
  await page.getByLabel('Escolha do exemplo sintético').selectOption('exportadores');
  await page.getByRole('button', { name: 'Preparar exemplo' }).click();
  const studyId = page.url().split('/').at(-1)!;
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), studyId))
    .toBe('SYNTHETIC:exportadores');
  const synthetic = await runCanonicalDiagnostic(page, studyId);
  expect(synthetic.sourceSnapshot?.source).toMatchObject({ kind: 'SYNTHETIC', recipe: { exampleId: 'exportadores' } });
  await page.goto(`/carteira/${studyId}`);
  await page.reload();
  await page.getByRole('button', { name: 'Trocar origem' }).click();
  await expect(page.getByRole('radio', { name: 'Carteira gerada (exemplo)' })).toBeChecked();
  await expect(page.getByLabel('Escolha do exemplo sintético')).toHaveValue('exportadores');
  expect(await persistedDiagnostics(page, studyId)).toEqual([synthetic]);

  await page.getByRole('radio', { name: 'Montar à mão (avançado)' }).check();
  await page.getByLabel('Nome do grupo').fill('Nome local que não cruza a rede');
  await page.getByRole('button', { name: 'Preparar carteira manual' }).click();
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), studyId))
    .toBe('AUTHORED');
  const authored = await runCanonicalDiagnostic(page, studyId);
  expect(authored.sourceSnapshot?.source.kind).toBe('AUTHORED');
  await page.goto(`/carteira/${studyId}`);
  await page.reload();
  await page.getByRole('button', { name: 'Trocar origem' }).click();
  await expect(page.getByRole('radio', { name: 'Montar à mão (avançado)' })).toBeChecked();
  expect(await persistedDiagnostics(page, studyId)).toEqual([synthetic, authored]);
  await expect.poll(async () => (await persistedDiagnostics(page, studyId)).length).toBe(2);

  expect(preparations.length).toBeGreaterThanOrEqual(3);
  expect(preparations.every((body) => !body.includes('Nome local que não cruza a rede'))).toBe(true);
  for (const body of preparations) {
    const document = JSON.parse(body) as { input: { sources: Record<string, { kind: string }> } };
    expect(Object.values(document.input.sources).every((source) =>
      source.kind === 'PADRAO_SINTETICO' || source.kind === 'ESTIMATIVA_USUARIO')).toBe(true);
  }
});
