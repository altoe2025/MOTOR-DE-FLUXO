import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ReplayDocument } from '../src/replay/domain';

const PROFILE_SEED_STUDY = '00000000-0000-4000-8000-000000000902';
const evidencePath = (name: string) => fileURLToPath(new URL(`../../docs/frontend/evidencias/${name}`, import.meta.url));

test.setTimeout(120_000);

async function releaseDiagnostics(page: Page, count: number, submittedBefore: number) {
  for (let index = 0; index < count; index += 1) {
    await expect.poll(async () => (await page.request.get('/__e2e__/diagnostics/state')).json())
      .toMatchObject({ pending: 1, submitted: submittedBefore + index + 1 });
    const response = await page.request.post('/__e2e__/diagnostics/release', { data: { fail: false } });
    expect(response.ok()).toBe(true);
  }
}

async function runDiagnostic(page: Page, studyId: string, scenarioId: string, repetitions: number) {
  await page.goto(`/estudos/${studyId}/diagnostico?scenarioId=${scenarioId}`);
  const state = await (await page.request.get('/__e2e__/diagnostics/state')).json() as { submitted: number };
  await page.getByRole('button', { name: 'Executar diagnóstico' }).click();
  await releaseDiagnostics(page, repetitions, state.submitted);
  await expect(page.getByRole('heading', { name: 'Diagnóstico concluído' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Execução selecionada' })).toBeVisible();
}

async function openReplay(page: Page): Promise<ReplayDocument> {
  const responsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST' && response.url().endsWith('/api/v1/replays')
  ));
  await page.getByRole('link', { name: 'Abrir Replay · Fronteira Viva' }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Fronteira Viva', exact: true })).toBeVisible();
  return response.json() as Promise<ReplayDocument>;
}

async function selectDay(page: Page, day: number) {
  await page.getByLabel('Selecionar dia').fill(String(day));
  await expect(page.getByText(new RegExp(`Dia ${day} de \\d+`)).first()).toBeVisible();
}

function dayValue(page: Page, label: string) {
  return page.locator('.replay-day-values > div').filter({ hasText: label }).locator('dd');
}

function dayWith(document: ReplayDocument, predicate: (day: ReplayDocument['days'][number]) => boolean): number {
  const found = document.days.find(predicate);
  if (found === undefined) throw new Error('Fixture não contém o evento obrigatório do aceite.');
  return found.day;
}

test('Replay observado reconstrói controles, parcial, gatilhos, vazio, OUT e reload', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  const seeded = await page.evaluate(() => window.__MOTOR_E2E__!.seedStage5Observed());
  await runDiagnostic(page, seeded.studyId, seeded.scenarioId, 1);
  const document = await openReplay(page);

  expect(document.days.map((day) => day.day)).toEqual(
    Array.from({ length: document.period.settlement_end_day + 1 }, (_, index) => index),
  );
  const arrivalDay = dayWith(document, (day) => day.events.some((event) => event.kind === 'ORDER_ARRIVED'));
  const partialDay = dayWith(document, (day) => day.closing !== null
    && Number(day.closing.matched_position_brl) > 0
    && Number(day.end_state.open_out_brl) + Number(day.end_state.open_in_brl) > 0);
  const simultaneousDay = dayWith(document, (day) => (day.closing?.triggers.length ?? 0) > 1);
  const remittedOutDay = dayWith(document, (day) => Number(day.closing?.remitted_out_brl ?? 0) > 0);
  const emptyDay = dayWith(document, (day) => day.events.length === 0 && day.closing === null);

  await page.screenshot({ path: evidencePath('mot89-observado-inicial-1280x800.png'), fullPage: true });
  await selectDay(page, arrivalDay);
  await expect(page.getByRole('region', { name: 'Cena Fronteira Viva' }).locator('.replay-order')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Repetir evento' }).click();
  await page.waitForTimeout(100);
  await page.screenshot({ path: evidencePath('mot89-observado-chegada.png'), fullPage: true });

  await selectDay(page, partialDay);
  await expect(dayValue(page, 'Ainda aberto')).not.toContainText('R$ 0,00');
  await page.getByRole('button', { name: 'Repetir evento' }).click();
  await expect.poll(() => page.locator('.replay-connection').count()).toBeGreaterThan(0);
  await expect(page.locator('.replay-connection-label')).toContainText(['Netting multilateral']);
  await expect(page.getByLabel('Legenda')).toContainText('Autonetting intracliente');
  await expect(page.getByLabel('Legenda')).toContainText('Netting multilateral');
  expect(await page.locator('.replay-connection').evaluateAll((paths) => paths.every((path) => {
    const value = path.getAttribute('d') ?? '';
    return value.startsWith('M ') && !value.includes('NaN');
  }))).toBe(true);
  const connectionBeforeResize = await page.locator('.replay-connection').first().getAttribute('d');
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect.poll(() => page.locator('.replay-connection').first().getAttribute('d')).not.toBe(connectionBeforeResize);
  await page.waitForTimeout(800);
  await page.screenshot({ path: evidencePath('mot89-observado-fechamento-parcial.png'), fullPage: true });

  await selectDay(page, simultaneousDay);
  await expect(page.locator('.replay-frontier__status')).toContainText('+');
  await selectDay(page, remittedOutDay);
  await expect(dayValue(page, 'Remetido OUT')).not.toContainText('R$ 0,00');
  await page.getByRole('button', { name: 'Repetir evento' }).click();
  await expect.poll(() => page.locator('.replay-connection--remitted').count()).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  await page.screenshot({ path: evidencePath('mot89-observado-remessa-out.png'), fullPage: true });

  await selectDay(page, emptyDay);
  await expect(page.getByRole('heading', { name: `Dia ${arrivalDay}` })).toBeVisible();
  await expect(page.getByRole('heading', { name: `Dia ${emptyDay}` })).toHaveCount(0);
  await expect(page.getByText(new RegExp(`Ordem .* chegou e entrou na fila aberta`)).first()).toBeVisible();
  await expect(page.locator('.replay-stage--animating')).toHaveCount(0);
  await page.getByRole('button', { name: 'Próximo fechamento' }).click();
  await expect(page.locator('.replay-frontier__status')).not.toContainText('Sem fechamento');
  await page.getByRole('button', { name: 'Anterior' }).click();
  await page.getByRole('button', { name: 'Seguinte →' }).click();
  await page.getByRole('button', { name: '▶ Tocar' }).click();
  await expect(page.getByRole('button', { name: 'Ⅱ Pausar' })).toBeVisible();
  await page.getByRole('button', { name: 'Ⅱ Pausar' }).click();

  const firstDayText = await page.getByLabel('Selecionar dia').inputValue();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Fronteira Viva', exact: true })).toBeVisible();
  expect(await page.getByLabel('Selecionar dia').inputValue()).toBe('0');
  expect(firstDayText).not.toBe('');

  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: evidencePath('mot89-observado-zoom-200.png'), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.zoom = '100%'; });
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test('Replay da hipótese sintética preserva a origem e mostra remessa IN', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  await page.evaluate(() => window.__MOTOR_E2E__!.seedStage4('PROFILE_HYPOTHESIS'));
  await page.goto(`/carteira/${PROFILE_SEED_STUDY}`);
  const company = 'stage4-company-b';
  await page.getByRole('checkbox', { name: new RegExp(company) }).check();
  const group = page.getByRole('group', { name: company, exact: true });
  await group.getByLabel('Finalidade OUT').fill('ANEXO_V_REMESSA_TERCEIRO');
  await group.getByLabel('Finalidade IN').fill('ANEXO_V_DISPONIBILIDADE');
  await page.getByRole('button', { name: 'Preparar simulação por Perfil' }).click();
  await expect.poll(() => page.url()).not.toContain(PROFILE_SEED_STUDY);
  const studyId = page.url().split('/').at(-1)!;
  const builder = page.getByRole('region', { name: 'Criar hipótese de composição' });
  await builder.getByLabel('Nome da hipótese').fill('Hipótese sintética IN');
  await builder.getByLabel(`Fração OUT — ${company}`).fill('0');
  await builder.getByRole('button', { name: 'Criar hipótese' }).click();
  await expect(page).toHaveURL(new RegExp(`/estudos/${studyId}/diagnostico\\?scenarioId=`));
  const persisted = await page.evaluate((id) => window.__MOTOR_E2E__!.stage4Snapshot(id), studyId);
  expect(persisted.sourceLabels).toEqual(['Simulação baseada em Perfil', 'Simulação baseada em Perfil']);
  const hypothesis = persisted.scenarios.find((scenario) => scenario.name === 'Hipótese sintética IN')!;
  await runDiagnostic(page, studyId, hypothesis.id, 10);
  const document = await openReplay(page);
  const remittedInDay = dayWith(document, (day) => Number(day.closing?.remitted_in_brl ?? 0) > 0);
  await selectDay(page, remittedInDay);
  await expect(dayValue(page, 'Remetido IN')).not.toContainText('R$ 0,00');
  await page.getByRole('button', { name: 'Repetir evento' }).click();
  await expect.poll(() => page.locator('.replay-connection--remitted').count()).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  await page.screenshot({ path: evidencePath('mot89-sintetico-remessa-in.png'), fullPage: true });
  await selectDay(page, document.period.settlement_end_day);
  await expect(page.getByRole('button', { name: '↺ Recomeçar' })).toBeVisible();
  await expect(dayValue(page, 'Ainda aberto')).toContainText('R$ 0,00');
  await page.screenshot({ path: evidencePath('mot89-sintetico-final.png'), fullPage: true });
});

test('limite efetivo 98 × 365 declara o teto 1.000 inalcançável e permanece navegável', async ({ page }) => {
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  const response = await page.request.get('/__e2e__/replay/limit', { timeout: 120_000 });
  expect(response.ok()).toBe(true);
  const payload = await response.json() as {
    report: Record<string, number | boolean>;
    document: ReplayDocument;
  };
  expect(payload.report).toMatchObject({
    requested_orders: 1000,
    requested_orders_supported: false,
    binding_limit: 'DIAGNOSTIC_PROVENANCE_MAX_500',
    provenance_entries: 499,
    orders: 98,
    days: 365,
    horizon_days_inclusive: 365,
    within_request_limit: true,
    within_response_limit: true,
  });
  const browser = await page.evaluate(({ document, day }) => (
    window.__MOTOR_E2E__!.measureReplayState(document, day, 10)
  ), { document: payload.document, day: payload.document.period.settlement_end_day });
  expect(browser.maxMs).toBeLessThan(250);
  writeFileSync(
    evidencePath('mot89-orcamento-1000x365.json'),
    `${JSON.stringify({ ...payload.report, browser_direct_state: browser }, null, 2)}\n`,
    'utf8',
  );
});
