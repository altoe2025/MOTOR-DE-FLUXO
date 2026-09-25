import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expectCanonicalPreview, persistedPreviews } from './helpers/persistedPreview';

const OWNER = '00000000-0000-4000-8000-000000000021';
const fixture = (name: string) => readFileSync(resolve('src/storage/__fixtures__', name), 'utf8')
  .replaceAll('owner-a', OWNER);

async function executeAndWait(page: Page) {
  await page.getByRole('button', { name: 'Executar cenário atual' }).click();
  await expect(page.getByRole('button', { name: 'Executando cenário…' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Executar cenário atual' })).toBeEnabled();
}

test('Stage 2 observed, authored, synthetic, migration, history and unique terminal remain readable', async ({ page }) => {
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
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);
  const studyId = page.url().split('/').at(-1)!;
  await executeAndWait(page);
  const synthetic = await expectCanonicalPreview(page, studyId);
  expect(synthetic.sourceSnapshot?.source.kind).toBe('SYNTHETIC');
  await page.getByRole('radio', { name: 'Autoria manual' }).check();
  await page.getByRole('button', { name: 'Preparar carteira manual' }).click();
  await executeAndWait(page);
  await expect.poll(async () => (await persistedPreviews(page, studyId)).length).toBe(2);
  const authored = await expectCanonicalPreview(page, studyId, 2);
  expect(authored.sourceSnapshot?.source.kind).toBe('AUTHORED');
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Autoria manual' })).toBeChecked();
  expect(await persistedPreviews(page, studyId)).toEqual([synthetic, authored]);
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.previewAttemptShapes(id), studyId))
    .toEqual([{ reservation: 1, terminal: 1 }, { reservation: 1, terminal: 1 }]);
});
