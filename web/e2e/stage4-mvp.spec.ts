import { expect, test, type Locator } from '@playwright/test';
import { runCanonicalDiagnostic } from './helpers/persistedDiagnostic';

const STUDY = '00000000-0000-4000-8000-000000000901';
test.setTimeout(90_000);

// Live replaced the hypothesis wizard with duplication, levers and the board.

// "Ajustar uma empresa" já vem aberto quando não há composição (uma empresa só).
async function openAdjust(levers: Locator) {
  const toggle = levers.getByRole('button', { name: /Ajustar uma empresa/ });
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}

test('duplicar observado permite variar janela sem alterar ordens, proveniência ou original', async ({ page }) => {
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  await page.evaluate(() => window.__MOTOR_E2E__!.seedStage4('OBSERVED_HYPOTHESIS'));
  await page.goto(`/carteira/${STUDY}`);
  const original = await page.evaluate((id) => window.__MOTOR_E2E__!.stage4Snapshot(id), STUDY);
  await page.getByRole('button', { name: 'Mais ações: estudo' }).click();
  await page.getByRole('menuitem', { name: 'Duplicar estudo', exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(STUDY));
  const copyId = page.url().split('/').at(-1)!;
  await page.getByRole('button', { name: 'Editar premissas' }).click();
  await page.getByRole('button', { name: /Avançado/ }).click();
  await page.getByLabel('Janela em dias', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Salvar premissas e período' }).click();
  await expect(page.getByText('Alterações salvas.', { exact: true })).toBeVisible();
  const copy = await page.evaluate((id) => window.__MOTOR_E2E__!.stage4Snapshot(id), copyId);
  expect(copy.scenarios[0]!.orderFingerprint).toBe(original.scenarios[0]!.orderFingerprint);
  expect(copy.scenarios[0]!.provenanceFingerprint).toBe(original.scenarios[0]!.provenanceFingerprint);
  expect(copy.sourceLabels).toEqual(['Dados observados']);
  expect(copy.scenarios[0]!.inputFingerprint).not.toBe(original.scenarios[0]!.inputFingerprint);
  expect(await page.evaluate((id) => window.__MOTOR_E2E__!.stage4Snapshot(id), STUDY)).toEqual(original);
  const base = await runCanonicalDiagnostic(page, STUDY);
  const changed = await runCanonicalDiagnostic(page, copyId);
  expect(base.premisesSnapshot.windowDays).toBe(7);
  expect(changed.premisesSnapshot.windowDays).toBe(3);
  await page.goto('/quadro');
  await page.getByRole('button', { name: 'Marcar todos', exact: true }).click();
  const table = page.getByRole('table').first();
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table).toContainText('7 d');
  await expect(table).toContainText('3 d');
  await expect(page.getByRole('note')).toContainText('premissas não são as mesmas');
});

test('alavanca cria variação isolada e mantém original observado persistido', async ({ page }) => {
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  await page.evaluate(() => window.__MOTOR_E2E__!.seedStage4('OBSERVED_HYPOTHESIS'));
  await page.goto(`/carteira/${STUDY}`);
  const before = await page.evaluate((id) => window.__MOTOR_E2E__!.stage4Snapshot(id), STUDY);
  const levers = page.getByRole('region', { name: 'Alavancas', exact: true });
  await openAdjust(levers);
  await levers.getByLabel('Volume OUT ×', { exact: true }).fill('2');
  await levers.getByRole('button', { name: 'Criar variação', exact: true }).click();
  await expect.poll(async () => (await page.evaluate((id) => window.__MOTOR_E2E__!.stage4Snapshot(id), STUDY)).scenarios.length).toBe(2);
  const after = await page.evaluate((id) => window.__MOTOR_E2E__!.stage4Snapshot(id), STUDY);
  expect(after.scenarios[0]).toEqual(before.scenarios[0]);
  expect(after.scenarios[1]!.orderFingerprint).not.toBe(before.scenarios[0]!.orderFingerprint);
  const changed = await runCanonicalDiagnostic(page, STUDY, after.scenarios[1]!.id);
  const base = await runCanonicalDiagnostic(page, STUDY, before.baseScenarioId);
  const originalOrders = base.envelope!.selected_execution.input_snapshot.cenario!.ordens;
  const changedOrders = changed.envelope!.selected_execution.input_snapshot.cenario!.ordens;
  expect(changedOrders.map((order) => order.id)).toEqual(originalOrders.map((order) => order.id));
  for (const order of originalOrders) {
    const actual = changedOrders.find((item) => item.id === order.id)!;
    expect(actual).toMatchObject({ direcao: order.direcao, dia_conhecida: order.dia_conhecida, dia_limite: order.dia_limite, finalidade: order.finalidade });
    expect(Number(actual.valor_brl)).toBe(Number(order.valor_brl) * (order.direcao === 'OUT' ? 2 : 1));
  }
  await page.reload();
  expect((await page.evaluate((id) => window.__MOTOR_E2E__!.stage4Snapshot(id), STUDY)).scenarios).toEqual(after.scenarios);
});
