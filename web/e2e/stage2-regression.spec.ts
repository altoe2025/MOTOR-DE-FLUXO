import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { persistedDiagnostics, runCanonicalDiagnostic } from './helpers/persistedDiagnostic';

const OWNER = '00000000-0000-4000-8000-000000000021';
const fixture = (name: string) => readFileSync(resolve('src/storage/__fixtures__', name), 'utf8')
  .replaceAll('owner-a', OWNER);

test('Stage 2 authored, synthetic, migration, history and unique terminal remain readable', async ({ page }) => {
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  const migrated = await page.evaluate((input) => window.__MOTOR_E2E__!.migrateLegacyFixtures(input), {
    draft: fixture('stage1-draft-v1.json'),
    study: fixture('study-document-v1.json'),
    importer: fixture('importer-database-v1.json'),
  });
  expect(migrated).toEqual({
    studies: ['00000000-0000-4000-8000-000000000020'],
    recoveredDraft: 'Carteira Amanda',
    archivedImporter: true,
  });

  await page.getByRole('button', { name: 'Novo estudo', exact: true }).click();

  await page.getByRole('radio', { name: 'Carteira gerada (exemplo)' }).check();

  await page.getByRole('button', { name: 'Criar com carteira gerada' }).click();
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);
  const studyId = page.url().split('/').at(-1)!;
  const synthetic = await runCanonicalDiagnostic(page, studyId);
  expect(synthetic.sourceSnapshot?.source.kind).toBe('SYNTHETIC');
  await page.goto(`/carteira/${studyId}`);
  await page.getByRole('button', { name: 'Trocar origem' }).click();
  await page.getByRole('radio', { name: 'Montar à mão (avançado)' }).check();
  await page.getByRole('button', { name: 'Preparar carteira manual' }).click();
  await expect(page.getByRole('button', { name: 'Trocar origem', exact: true })).toBeVisible();
  await expect(page.getByText('Alterações salvas.', { exact: true })).toBeVisible();
  const authored = await runCanonicalDiagnostic(page, studyId);
  await expect.poll(async () => (await persistedDiagnostics(page, studyId)).length).toBe(2);
  expect(authored.sourceSnapshot?.source.kind).toBe('AUTHORED');
  await page.goto(`/carteira/${studyId}`);
  await page.reload();
  await page.getByRole('button', { name: 'Trocar origem' }).click();
  await expect(page.getByRole('radio', { name: 'Montar à mão (avançado)' })).toBeChecked();
  expect(await persistedDiagnostics(page, studyId)).toEqual([synthetic, authored]);
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studyExecutionStatuses(id), studyId))
    .toEqual(['QUEUED', 'SUCCEEDED', 'QUEUED', 'SUCCEEDED']);
  expect(new Set([synthetic.attemptId, authored.attemptId]).size).toBe(2);
});
