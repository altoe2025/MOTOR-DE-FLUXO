import Decimal from 'decimal.js';
import { expect, test, type Page } from '@playwright/test';

import { formatMoney } from '../src/presentation/format';

type DiagnosticState = { pending: number; submitted: number; active: number };

async function diagnosticState(page: Page): Promise<DiagnosticState> {
  const response = await page.request.get('/__e2e__/diagnostics/state');
  expect(response.ok()).toBe(true);
  return response.json() as Promise<DiagnosticState>;
}

async function releaseDiagnostics(page: Page, submittedBefore: number, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await expect.poll(() => diagnosticState(page), { timeout: 60_000 })
      .toMatchObject({ pending: 1, submitted: submittedBefore + index + 1 });
    const released = await page.request.post('/__e2e__/diagnostics/release', { data: { fail: false } });
    expect(released.ok(), await released.text()).toBe(true);
  }
  await expect.poll(() => diagnosticState(page)).toMatchObject({ pending: 0, active: 0 });
}

test('63 carteiras sintéticas diagnosticadas pelo motor real permitem explorar objetivos, filtros, alternativas e marginais', async ({ page }) => {
  test.setTimeout(900_000);

  await page.goto('/estudos');
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  const seed = await page.evaluate(() => window.__MOTOR_E2E__!.seedPortfolioShowcase());
  expect(seed.companyIds).toHaveLength(6);
  expect(new Set(seed.companyIds).size).toBe(6);
  expect(seed.companyNames).toEqual([
    'PSP Inbound Sintética', 'Remessas Digitais Sintética', 'Folha Global Sintética',
    'Exportadora Sintética', 'Cripto Liquidação Sintética', 'Tesouraria Sintética',
  ]);
  await page.reload();
  await page.getByRole('button', { name: 'Mais ações: criar' }).click();
  await page.getByRole('menuitem', { name: 'Nova combinação de carteiras' }).click();
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);
  const studyId = page.url().split('/').at(-1)!;

  const companies = page.getByRole('group', { name: 'Empresas da carteira' });
  for (const name of seed.companyNames) {
    await companies.getByRole('checkbox', { name: new RegExp(`^${name} ·`) }).check();
  }
  await companies.getByRole('button', { name: 'Usar 6 casos juntos' }).click();
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), studyId))
    .toBe('AUTHORED');
  await expect(page.getByText('Alterações salvas.')).toBeVisible();

  const submittedBefore = (await diagnosticState(page)).submitted;
  await page.getByRole('button', { name: 'Diagnosticar combinações' }).click();
  await expect(page).toHaveURL(new RegExp(`/estudos/${studyId}/diagnostico`));
  await releaseDiagnostics(page, submittedBefore, 63);
  await expect.poll(async () => {
    const states = await page.evaluate((id) => window.__MOTOR_E2E__!.studyDiagnosticStates(id), studyId);
    return { total: states.length, succeeded: states.filter((state) => state.status === 'SUCCEEDED').length };
  }, { timeout: 120_000 }).toEqual({ total: 63, succeeded: 63 });

  const analysis = page.getByRole('region', { name: 'Qual carteira atende melhor?' });
  await expect(analysis.locator('.portfolio-overview > div').filter({ hasText: 'Carteiras preparadas' })).toContainText('63');
  await expect(analysis.locator('.portfolio-overview > div').filter({ hasText: 'Comparáveis atuais' })).toContainText('63');
  await expect(analysis.locator('.portfolio-overview > div').filter({ hasText: 'Atendem aos critérios' })).toContainText('63');
  await expect(analysis.getByRole('combobox', { name: 'Objetivo' })).toHaveValue('savings');
  await expect(analysis).toContainText('Todas as combinações únicas da carteira atual foram avaliadas.');

  const before = await page.evaluate((id) => window.__MOTOR_E2E__!.demoAcceptanceSnapshot()
    .then((snapshot) => snapshot.studies.find((study) => study.id === id)), studyId);
  expect(before).toBeDefined();
  expect(before!.scenarios).toHaveLength(63);
  expect(before!.diagnostics).toHaveLength(63);
  const compositions = new Set(before!.scenarios.map((scenario) => [...scenario.companyIds].sort().join('|')));
  const expectedCompositions = new Set(Array.from({ length: 63 }, (_, index) => seed.companyIds
    .filter((_, bit) => ((index + 1) & (1 << bit)) !== 0).sort().join('|')));
  expect(compositions).toEqual(expectedCompositions);
  const singletons = before!.scenarios.filter((scenario) => scenario.participantCount === 1);
  expect(singletons).toHaveLength(6);
  for (const scenario of singletons) {
    const diagnostic = before!.diagnostics.find((row) => row.scenarioId === scenario.id)!;
    expect(new Decimal(diagnostic.savingsBrl).isZero()).toBe(true);
    expect(new Decimal(diagnostic.netability).isZero()).toBe(true);
  }
  const expectedSavings = before!.diagnostics.reduce((maximum, row) => Decimal.max(maximum, row.savingsBrl),
    new Decimal(before!.diagnostics[0]!.savingsBrl));
  expect(expectedSavings.gt(100_000)).toBe(true);
  expect(new Set(before!.diagnostics.map((row) => row.savingsBrl)).size).toBeGreaterThan(1);
  expect(new Set(before!.diagnostics.map((row) => row.netability)).size).toBeGreaterThan(1);
  const explorationRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/v1\/(?:diagnosticos|preparacoes)$/.test(new URL(request.url()).pathname)) {
      explorationRequests.push(request.url());
    }
  });
  await expect(analysis.getByRole('heading', { name: /Composição recomendada:/ })).toBeVisible();
  await expect(analysis.locator('.portfolio-recommendation')).toContainText(formatMoney(expectedSavings.toFixed()));
  await expect(analysis.getByRole('heading', { name: 'Economia e espera das carteiras' })).toHaveCount(0);
  await expect(analysis.getByRole('table', { name: /Dados do gráfico/ })).toHaveCount(0);
  await expect(analysis.getByRole('table', { name: /Todas as composições/ })).toHaveCount(0);

  const defaultWinner = await analysis.getByRole('heading', { name: /Composição recomendada:/ }).innerText();
  await analysis.getByRole('combobox', { name: 'Objetivo' }).selectOption('wait');
  await expect(analysis.getByRole('heading', { name: /Composição recomendada:/ })).toBeVisible();
  await analysis.getByRole('combobox', { name: 'Objetivo' }).selectOption('efficiency');
  const efficiencyWinner = await analysis.getByRole('heading', { name: /Composição recomendada:/ }).innerText();
  await analysis.getByRole('combobox', { name: 'Objetivo' }).selectOption('netability');
  const netabilityWinner = await analysis.getByRole('heading', { name: /Composição recomendada:/ }).innerText();
  expect(efficiencyWinner).not.toBe(defaultWinner);
  expect(netabilityWinner).not.toBe(defaultWinner);
  await analysis.getByRole('combobox', { name: 'Objetivo' }).selectOption('savings');
  await expect(analysis.getByRole('heading', { name: /Composição recomendada:/ })).toHaveText(defaultWinner);

  const impossibleSavings = expectedSavings.plus(expectedSavings.abs()).plus(1).toFixed();
  await analysis.getByRole('textbox', { name: 'Economia mínima (R$)' }).fill(impossibleSavings);
  await expect(analysis).toContainText('Nenhuma carteira atende aos filtros.');
  await analysis.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(analysis.getByRole('heading', { name: /Composição recomendada:/ })).toHaveText(defaultWinner);
  await analysis.getByRole('textbox', { name: 'Espera média máxima (dias)' }).fill('-1');
  await expect(analysis.getByRole('textbox', { name: 'Espera média máxima (dias)' })).toHaveAttribute('aria-invalid', 'true');
  await expect(analysis.getByRole('heading', { name: /Composição recomendada:/ })).toHaveCount(0);
  await analysis.getByRole('button', { name: 'Limpar filtros' }).click();

  const highlights = analysis.getByRole('region', { name: 'Alternativas em destaque' });
  const highlightButtons = highlights.getByRole('button');
  await expect(highlightButtons).toHaveCount(3);
  const selectedName = await highlightButtons.nth(1).innerText();
  await highlightButtons.nth(1).click();
  await expect(analysis.getByRole('region', { name: `Detalhes da composição: ${selectedName}` })).toBeVisible();
  await expect(analysis.getByRole('heading', { name: /Composição recomendada:/ })).toHaveText(defaultWinner);

  const marginal = analysis.getByRole('region', { name: `Contribuição marginal: ${selectedName}`, exact: true });
  await expect(marginal).toBeVisible();
  await marginal.getByText('Ver todos os valores: antes, depois e diferença', { exact: true }).click();
  const counterpart = marginal.getByRole('button', { name: /^Analisar composição / }).first();
  await expect(counterpart).toBeVisible();
  await counterpart.click();
  await expect(analysis.getByRole('region', { name: `Detalhes da composição: ${selectedName}` })).toHaveCount(0);
  await expect(analysis.getByRole('heading', { name: /Composição recomendada:/ })).toHaveText(defaultWinner);

  expect(explorationRequests).toEqual([]);
  expect((await diagnosticState(page)).submitted).toBe(submittedBefore + 63);
  const after = await page.evaluate((id) => window.__MOTOR_E2E__!.demoAcceptanceSnapshot()
    .then((snapshot) => snapshot.studies.find((study) => study.id === id)), studyId);
  expect(after).toEqual(before);
});
