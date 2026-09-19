import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OWNER = '00000000-0000-4000-8000-000000000021';
const fixture = (name: string) => readFileSync(resolve('src/storage/__fixtures__', name), 'utf8')
  .replaceAll('owner-a', OWNER);

test('two tabs expose CAS conflict while a second account stays isolated', async ({ browser }) => {
  const contextA = await browser.newContext();
  await contextA.addInitScript(() => {
    const messages: unknown[] = [];
    Object.defineProperty(window, '__motorChannelMessages', { value: messages });
    class SilentBroadcastChannel {
      onmessage = null;
      postMessage(value: unknown) { messages.push(value); }
      addEventListener() {}
      removeEventListener() {}
      close() {}
    }
    Object.defineProperty(window, 'BroadcastChannel', { value: SilentBroadcastChannel });
  });
  const pageA = await contextA.newPage();
  const pageB = await contextA.newPage();
  await pageA.goto('/estudos');
  await pageA.getByRole('button', { name: 'Novo estudo' }).click();
  await expect(pageA).toHaveURL(/\/estudos\/[0-9a-f-]+$/);
  const studyUrl = pageA.url();
  const studyId = studyUrl.split('/').at(-1)!;
  await pageA.waitForFunction(() => '__MOTOR_E2E__' in window);
  await expect.poll(() => pageA.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), studyId))
    .toBe('SYNTHETIC:equilibrado');
  await pageB.goto(studyUrl);
  await expect(pageB.getByRole('heading', { name: 'Novo estudo' })).toBeVisible();

  await pageA.getByLabel('Nome do estudo').fill('Edição da aba A');
  await pageB.getByLabel('Nome do estudo').fill('Edição da aba B');
  await pageA.getByRole('button', { name: 'Salvar nome' }).click();
  await expect.poll(() => pageA.evaluate((id) => window.__MOTOR_E2E__!.studyName(id), studyId))
    .toBe('Edição da aba A');
  await pageB.getByRole('button', { name: 'Salvar nome' }).click();
  await expect(pageB.getByRole('alert')).toContainText('alterado em outra aba');
  const channelMessages = (await Promise.all([pageA, pageB].map((page) => page.evaluate(() => (
    window as typeof window & { __motorChannelMessages: unknown[] }
  ).__motorChannelMessages)))).flat();
  expect(channelMessages.length).toBeGreaterThan(0);
  for (const message of channelMessages) {
    expect(message).toEqual({
      operationId: expect.any(String),
      revision: expect.any(Number),
      studyId,
    });
  }
  expect(JSON.stringify(channelMessages)).not.toContain('Edição da aba');

  await pageB.evaluate(() => localStorage.setItem('motor-fluxo:e2e-account', 'b'));
  await pageB.reload();
  await pageB.goto('/estudos');
  await expect(pageB.getByText('Nenhum estudo salvo nesta conta.')).toBeVisible();
  await expect(pageB.getByText(/Edição da aba [AB]/)).toHaveCount(0);

  await pageB.evaluate(() => localStorage.setItem('motor-fluxo:e2e-account', 'a'));
  await pageB.reload();
  await pageB.goto('/estudos');
  await expect(pageB.getByText('Edição da aba A')).toBeVisible();
  await contextA.close();
});

test('the Chromium migration bridge loads a real legacy study into IndexedDB', async ({ page }) => {
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  const result = await page.evaluate(async () => {
    const bridge = (window as typeof window & {
      __MOTOR_E2E__?: { migrateLegacyStudy(raw: string): Promise<readonly string[]> };
    }).__MOTOR_E2E__;
    if (bridge === undefined) throw new Error('E2E bridge unavailable');
    return bridge.migrateLegacyStudy(JSON.stringify({
      study_schema_version: '1.0.0',
      id: '00000000-0000-4000-8000-000000000020',
      owner_sub: '00000000-0000-4000-8000-000000000021',
      name: 'Estudo legado no Chromium',
      created_at: '2026-09-11T00:00:00Z',
      updated_at: '2026-09-11T00:00:00Z',
      base: {
        id: '00000000-0000-4000-8000-000000000010', revision: 1,
        input: {
          ordens: [], janela_dias: 1, horizonte_dias: 0,
          custo: { iof_out: '0.035', iof_in: '0.0038', carry_cnr: '0.0004', spread_rail_bps: '0', custo_fixo_remessa: '0', custo_oportunidade_aa: '0', ptax: '5.40', iof_por_finalidade: [] },
        },
        period: { modo: 'LEGADO' },
        provenance: { '/janela_dias': { tipo: 'PADRAO_SINTETICO', fonte: 'fixture E2E', registrado_em_utc: '2026-09-11T00:00:00Z' } },
      },
      variants: [], results: [], selected_replay: null,
    }));
  });
  expect(result).toEqual(['00000000-0000-4000-8000-000000000020']);
});

test('real Chromium storage covers all legacy fixtures, interruption, blocked upgrade and corruption', async ({ page }) => {
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

  const interruptedDocument = JSON.parse(fixture('study-document-v1.json')) as {
    base: { input: { ordens: unknown[]; horizonte_dias: number } };
  };
  interruptedDocument.base.input.horizonte_dias = 3;
  interruptedDocument.base.input.ordens = [{
    id: 'legacy-order', cliente_id: 'legacy-client', direcao: 'OUT', dia_conhecida: 0,
    dia_limite: 2, valor_brl: '100', finalidade: 'ANEXO_V_REMESSA_TERCEIRO', eh_efx: false,
  }];
  const interrupted = await page.evaluate((raw) =>
    window.__MOTOR_E2E__!.recoverInterruptedLegacyStudy(raw), JSON.stringify(interruptedDocument));
  expect(interrupted).toEqual(['INTERRUPTED']);

  await expect(page.evaluate(() => window.__MOTOR_E2E__!.probeBlockedAndCorruptStorage()))
    .resolves.toEqual({ blocked: true, corruptionCode: 'DOCUMENT_CORRUPT' });
});

test('injected Chromium quota failure is surfaced without claiming physical disk exhaustion', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/api/v1/health');
  const session = await context.newCDPSession(page);
  await session.send('Storage.overrideQuotaForOrigin', {
    origin: 'http://127.0.0.1:8021', quotaSize: 1,
  });
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  await expect(page.evaluate(() => window.__MOTOR_E2E__!.probeQuotaWrite(1024 * 1024)))
    .resolves.toBe('AbortError');
  await context.close();
});
