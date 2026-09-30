import { expect, test } from '@playwright/test';
import { runCanonicalDiagnostic } from './helpers/persistedDiagnostic';

const STUDY = '00000000-0000-4000-8000-000000000902';
test.setTimeout(90_000);

// The published composition flow combines observed companies instead of editing profile recipes.
test('combina empresas, gera subconjuntos, executa e recarrega o quadro', async ({ page }) => {
  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  await page.evaluate(() => window.__MOTOR_E2E__!.seedStage4('PROFILE_HYPOTHESIS'));
  await page.goto(`/carteira/${STUDY}`);
  await page.getByRole('button', { name: 'Trocar origem' }).click();
  await page.getByRole('radio', { name: 'Carteira de várias empresas' }).check();
  for (const company of ['Empresa A', 'Empresa B']) await page.getByRole('checkbox', { name: new RegExp(company) }).check();
  await page.getByRole('button', { name: 'Usar 2 casos juntos' }).click();
  const builder = page.getByRole('region', { name: 'Alavancas', exact: true });
  await builder.getByRole('button', { name: 'Fazer composição (2 combinações)' }).click();
  await expect.poll(async () => (await page.evaluate((id) => window.__MOTOR_E2E__!.stage4Snapshot(id), STUDY)).scenarios.length).toBe(3);
  const snapshot = await page.evaluate((id) => window.__MOTOR_E2E__!.stage4Snapshot(id), STUDY);
  const executions = [];
  for (const scenario of snapshot.scenarios) executions.push(await runCanonicalDiagnostic(page, STUDY, scenario.id));
  const inputs = executions.map((item) => item.envelope!.selected_execution.input_snapshot.cenario!.ordens);
  expect(inputs[0]).toHaveLength(40);
  expect(inputs[1]).toHaveLength(20);
  expect(inputs[2]).toHaveLength(20);
  expect([...inputs[1]!, ...inputs[2]!].sort((a, b) => a.id.localeCompare(b.id)))
    .toEqual([...inputs[0]!].sort((a, b) => a.id.localeCompare(b.id)));
  for (const execution of executions.slice(1)) {
    for (const order of execution.sourceSnapshot!.orders) {
      expect(execution.sourceSnapshot!.provenanceByOrder![order.id])
        .toEqual(executions[0]!.sourceSnapshot!.provenanceByOrder![order.id]);
    }
  }
  expect(snapshot.evidenceProfileIds).toEqual(['stage4-profile-a', 'stage4-profile-b']);
  await page.goto('/quadro');
  await page.getByRole('button', { name: 'Marcar todos', exact: true }).click();
  await expect(page.getByRole('table').first().locator('tbody tr')).toHaveCount(3);
  await page.reload();
  await expect(page.getByRole('table').first().locator('tbody tr')).toHaveCount(3);
  expect((await page.evaluate((id) => window.__MOTOR_E2E__!.stage4Snapshot(id), STUDY)).scenarios).toEqual(snapshot.scenarios);
  await page.goto(`/carteira/${STUDY}`);
  await expect(page.getByRole('heading', { name: 'Etapa 4 Perfis', level: 1 })).toBeVisible();
  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('conflito CAS mantém os valores da alavanca na aba perdedora', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    class SilentBroadcastChannel { onmessage = null; postMessage() {} addEventListener() {} removeEventListener() {} close() {} }
    Object.defineProperty(window, 'BroadcastChannel', { value: SilentBroadcastChannel });
  });
  const winner = await context.newPage();
  const loser = await context.newPage();
  await winner.goto('/estudos');
  await winner.waitForFunction(() => '__MOTOR_E2E__' in window);
  await winner.evaluate(() => window.__MOTOR_E2E__!.seedStage4('OBSERVED_HYPOTHESIS'));
  await winner.goto('/carteira/00000000-0000-4000-8000-000000000901');
  await loser.goto(winner.url());
  const first = winner.getByRole('region', { name: 'Alavancas', exact: true });
  const second = loser.getByRole('region', { name: 'Alavancas', exact: true });
  await first.getByLabel('Volume OUT ×', { exact: true }).fill('2');
  await second.getByLabel('Volume OUT ×', { exact: true }).fill('3');
  await first.getByRole('button', { name: 'Criar variação', exact: true }).click();
  await expect(winner.getByRole('region', { name: 'Cenários do estudo' }).locator('li')).toHaveCount(2);
  await second.getByRole('button', { name: 'Criar variação', exact: true }).click();
  await expect(loser.getByRole('alert').first()).toContainText(/outra aba|sessão mudou|revisão esperada/i);
  await expect(second.getByLabel('Volume OUT ×', { exact: true })).toHaveValue('3');
  await context.close();
});
