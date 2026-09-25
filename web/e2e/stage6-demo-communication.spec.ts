import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { AXIS_TITLES } from '../src/hypotheses/comparison';
import { formatFraction, formatMoney } from '../src/presentation/format';

const OWNER = '00000000-0000-4000-8000-000000000021';
const packageValue = JSON.parse(readFileSync(fileURLToPath(new URL('../src/demo/generated/demo-study.v1.json', import.meta.url)), 'utf8')) as {
  mixes: readonly { label: string }[];
};

type DemoSnapshot = {
  studies: readonly {
    id: string; name: string; ownerSub: string; deletedAt: string | null;
    scenarios: readonly { id: string; name: string; inputFingerprint: string; participantCount: number }[];
    diagnostics: readonly { id: string; scenarioId: string; repetitionId: string; count: number; savingsBrl: string; netability: string }[];
  }[];
  profiles: readonly { id: string; documentFingerprint: string; version: number }[];
  marker: 'INSTALLED' | 'REMOVED' | null;
};
type AcceptanceBridge = {
  demoAcceptanceSnapshot(): Promise<DemoSnapshot>;
  purgeDemoForAcceptance(id: string): Promise<void>;
  compareDemoExecutions(studyId: string, baseId: string, hypothesisId: string): Promise<{ ok: boolean; reason?: string }>;
  projectDemoCommunication(input: { studyId: string; scenarioId: string; diagnosticExecutionId: string; comparisonExecutionId?: string; replayDay: number }): Promise<{
    contextFingerprint: string;
    source: { synthetic: boolean; label: string };
    selection: { repetitionId: string; replayDay: number; comparisonExecutionId: string | null };
    executiveMetrics: readonly { code: string; value: string | null; evidenceRefs: readonly string[] }[];
    comparison: {
      metrics: readonly { code: string; label: string; value: string | null; evidenceRefs: readonly string[] }[];
      facts: readonly { code: string; label: string; value: string; evidenceRefs: readonly string[] }[];
    } | null;
    replaySnapshot: { metrics: readonly { code: string; value: string | null; evidenceRefs: readonly string[] }[] } | null;
    evidenceIndex: Record<string, { value: string | null }>;
  }>;
};

function bridge(page: Page) {
  return page.evaluate(() => Boolean((window.__MOTOR_E2E__ as unknown as AcceptanceBridge | undefined)?.demoAcceptanceSnapshot));
}

async function snapshot(page: Page): Promise<DemoSnapshot> {
  await page.waitForFunction(() => '__MOTOR_E2E__' in window);
  return page.evaluate(() => (window.__MOTOR_E2E__ as unknown as AcceptanceBridge).demoAcceptanceSnapshot());
}

async function installedDemo(page: Page): Promise<DemoSnapshot> {
  await expect.poll(async () => (await snapshot(page)).studies.length, { timeout: 20_000 }).toBe(1);
  return snapshot(page);
}

async function purge(page: Page, id: string): Promise<void> {
  await page.evaluate((studyId) => (window.__MOTOR_E2E__ as unknown as AcceptanceBridge).purgeDemoForAcceptance(studyId), id);
}

async function releaseDiagnostics(page: Page, count: number, submittedBefore: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await expect.poll(async () => (await page.request.get('/__e2e__/diagnostics/state')).json())
      .toMatchObject({ pending: 1, submitted: submittedBefore + index + 1 });
    const response = await page.request.post('/__e2e__/diagnostics/release', { data: { fail: false } });
    expect(response.ok()).toBe(true);
  }
}

const headers = ['operacao_id', 'cliente_nome', 'classificacao_perfil', 'direcao', 'data_conhecida', 'data_limite', 'valor_brl'];
function importedWorkbook(): Buffer {
  const fixture = readFileSync(fileURLToPath(new URL('../src/importer/__fixtures__/valid-minimal.xlsx', import.meta.url)));
  const entries = unzipSync(fixture);
  const rows = [headers,
    ['B6-OUT', 'CLIENTE_B6_BRUTO', 'PERFIL_B6_BRUTO', 'OUT', '01/01/2026', '03/01/2026', '100,00'],
    ['B6-IN', 'CLIENTE_B6_BRUTO', 'PERFIL_B6_BRUTO', 'IN', '01/01/2026', '03/01/2026', '100,00'],
  ];
  const xml = rows.map((row, index) => `<row r="${index + 1}">${row.map((value, column) => `<c r="${String.fromCharCode(65 + column)}${index + 1}" t="inlineStr"><is><t>${value}</t></is></c>`).join('')}</row>`).join('');
  entries['xl/worksheets/sheet1.xml'] = strToU8(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xml}</sheetData></worksheet>`);
  return Buffer.from(zipSync(entries, { mtime: new Date('2020-01-01T00:00:00Z') }));
}

test('primeiro acesso instala uma vez; remoção não ressuscita e restauração é explícita', async ({ page }) => {
  await page.goto('/estudos');
  await expect(page.getByRole('heading', { name: 'Estudos' })).toBeVisible();
  await expect.poll(() => bridge(page)).toBe(true);
  const first = await installedDemo(page);
  expect(first.marker).toBe('INSTALLED');
  expect(first.studies).toHaveLength(1);
  expect(first.studies[0]).toMatchObject({ name: 'Estudo demonstrativo sintético', ownerSub: OWNER, deletedAt: null });
  expect(first.studies[0]!.scenarios.map((item) => item.name)).toEqual(packageValue.mixes.map((item) => item.label));
  expect(first.studies[0]!.diagnostics).toHaveLength(5);
  expect(first.profiles).toHaveLength(12);
  await page.reload();
  expect(await snapshot(page)).toEqual(first);

  await purge(page, first.studies[0]!.id);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Carregar estudo demonstrativo' })).toBeVisible();
  expect((await snapshot(page)).marker).toBe('REMOVED');
  expect((await snapshot(page)).studies).toHaveLength(0);
  await page.getByRole('button', { name: 'Carregar estudo demonstrativo' }).click();
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);
  const restored = await snapshot(page);
  expect(restored.marker).toBe('INSTALLED');
  expect(restored.studies).toHaveLength(1);
  expect(restored.studies[0]!.scenarios.map((item) => item.name)).toEqual(packageValue.mixes.map((item) => item.label));
});

test('Etapa 6: finalidade opcional executa XLSX e demo restaura com Estudo importado presente', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/estudos');
  const demoId = (await installedDemo(page)).studies[0]!.id;
  await purge(page, demoId);
  await page.goto('/importar');
  await page.getByLabel('Nome da nova empresa').fill('Empresa B6 importada');
  await page.getByRole('button', { name: 'Usar nova empresa neste Caso' }).click();
  await page.getByLabel('Planilha canônica XLSX').setInputFiles({
    name: 'caso-b6.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: importedWorkbook(),
  });
  await page.getByRole('checkbox', { name: /operações explícitas/ }).check();
  await page.getByRole('button', { name: 'Ler planilha' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar operações' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar Caso Observado' }).click();
  await expect(page.getByRole('heading', { name: 'Caso confirmado' })).toBeVisible();
  const profileUrl = await page.getByRole('link', { name: 'Criar Perfil Operacional' }).getAttribute('href');
  await page.goto(profileUrl!);
  await page.getByRole('button', { name: 'Confirmar versão' }).click();
  await expect(page.getByRole('heading', { name: 'Versão 1' })).toBeVisible();
  await page.goto('/estudos');
  await page.getByRole('button', { name: 'Novo estudo', exact: true }).click();
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);
  const importedStudyId = page.url().split('/').at(-1)!;
  await page.getByRole('radio', { name: 'Caso observado', exact: true }).check();
  const caseId = new URL(profileUrl!, page.url()).searchParams.get('caseId')!;
  await page.getByLabel('Caso confirmado').selectOption(caseId);
  await page.getByRole('button', { name: 'Usar caso confirmado' }).click();
  await page.getByRole('button', { name: 'Executar cenário atual' }).click();
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studyExecutionStatuses(id), importedStudyId)).toEqual(['RUNNING', 'SUCCEEDED']);
  await page.goto(`/estudos/${importedStudyId}/diagnostico`);
  await page.getByRole('button', { name: 'Executar diagnóstico', exact: true }).click();
  await expect.poll(async () => (await page.request.get('/__e2e__/diagnostics/state')).json()).toMatchObject({ pending: 1 });
  expect((await page.request.post('/__e2e__/diagnostics/release', { data: { fail: false } })).ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Resultado do motor' })).toBeVisible();
  expect(await page.evaluate((id) => window.__MOTOR_E2E__!.studyExecutionStatuses(id), importedStudyId)).toEqual(['RUNNING', 'SUCCEEDED', 'QUEUED', 'SUCCEEDED']);
  await page.goto('/estudos');
  await expect(page.getByRole('button', { name: 'Carregar estudo demonstrativo' })).toBeVisible();
  await page.getByRole('button', { name: 'Carregar estudo demonstrativo' }).click();
  const state = await snapshot(page);
  expect(state.studies).toHaveLength(2);
  expect(state.studies.map((item) => item.id)).toContain(importedStudyId);
  expect(state.studies.filter((item) => item.name === 'Estudo demonstrativo sintético')).toHaveLength(1);
  expect(await page.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), importedStudyId)).toBe('OBSERVED_CASE');
});

test('cinco cenários exibem repetição e Replay; documento projeta as mesmas evidências', async ({ page }) => {
  await page.goto('/estudos');
  const state = await installedDemo(page);
  const study = state.studies[0]!;
  expect(study.scenarios).toHaveLength(5);
  for (const scenario of study.scenarios) {
    const diagnostic = study.diagnostics.find((item) => item.scenarioId === scenario.id)!;
    expect(scenario.participantCount).toBe(12);
    expect(scenario.inputFingerprint).toMatch(/^[0-9a-f]{64}$/);
    await page.goto(`/estudos/${study.id}/diagnostico?scenarioId=${scenario.id}`);
    await expect(page.getByRole('heading', { name: 'Diagnóstico robusto' })).toBeVisible();
    const selection = page.getByRole('heading', { name: 'Resultado do motor' }).locator('..');
    expect(diagnostic.count).toBe(10);
    await expect(selection.getByTestId('economia-brl')).toHaveText(formatMoney(diagnostic.savingsBrl));
    await expect(selection.getByTestId('netabilidade')).toHaveText(formatFraction(diagnostic.netability));
    await page.getByRole('link', { name: 'Abrir Replay · Fronteira Viva' }).click();
    await expect(page.getByRole('heading', { name: 'Fronteira Viva', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Repetição exibida' })).toContainText(diagnostic.repetitionId);
    const projected = await page.evaluate((input) => (window.__MOTOR_E2E__ as unknown as AcceptanceBridge).projectDemoCommunication(input), {
      studyId: study.id, scenarioId: scenario.id, diagnosticExecutionId: diagnostic.id, replayDay: 31,
    });
    expect(projected.source).toMatchObject({ synthetic: true });
    expect(projected.source.label).toContain('não calibrada');
    expect(projected.selection.repetitionId).toBe(diagnostic.repetitionId);
    expect(projected.executiveMetrics.find((metric) => metric.code === 'SAVINGS_BRL')?.value).toBe(diagnostic.savingsBrl);
    expect(projected.executiveMetrics.find((metric) => metric.code === 'NETABILITY')?.value).toBe(diagnostic.netability);
    await expect(page.getByRole('region', { name: 'Acumulados do Replay' })).toContainText(formatFraction(diagnostic.netability));
    await page.getByLabel('Selecionar dia').fill('31');
    await expect(page.getByText(/Dia 31 de \d+/).first()).toBeVisible();
    expect(projected.replaySnapshot?.metrics.length).toBeGreaterThan(0);
    const matched = projected.replaySnapshot!.metrics.find((metric) => metric.code === 'measured_matched_contribution_accumulated_brl');
    expect(matched?.value).not.toBeNull();
    await expect(page.getByRole('region', { name: 'Acumulados do Replay' })).toContainText(formatMoney(matched!.value));
    for (const metric of [...projected.executiveMetrics, ...projected.replaySnapshot!.metrics]) {
      expect(metric.evidenceRefs.length).toBeGreaterThan(0);
      for (const ref of metric.evidenceRefs) expect(projected.evidenceIndex[ref]).toBeDefined();
    }
    const again = await page.evaluate((input) => (window.__MOTOR_E2E__ as unknown as AcceptanceBridge).projectDemoCommunication(input), {
      studyId: study.id, scenarioId: scenario.id, diagnosticExecutionId: diagnostic.id, replayDay: 31,
    });
    expect(again.contextFingerprint).toBe(projected.contextFingerprint);
  }
});

test('hipótese guiada preserva Perfis; compara diagnóstico compatível e explica incompatibilidade', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/estudos');
  const study = (await installedDemo(page)).studies[0]!;
  const base = study.diagnostics.find((item) => item.scenarioId === study.scenarios[0]!.id)!;
  const beforeProfiles = (await snapshot(page)).profiles;
  await page.goto(`/carteira/${study.id}`);
  await page.getByRole('button', { name: 'Criar hipótese / alterar carteira' }).click();
  const builder = page.getByRole('region', { name: 'Criar hipótese de composição' });
  await expect(builder).toBeVisible();
  const removeButton = builder.getByRole('group', { name: 'Participantes' }).getByRole('button', { name: /^Remover / }).first();
  const company = (await removeButton.innerText()).replace(/^Remover /, '');
  await removeButton.click();
  await builder.getByLabel('Adicionar Perfil').selectOption({ label: company });
  await builder.getByLabel('Nome da hipótese').fill('Troca guiada B6');
  await builder.getByRole('button', { name: 'Criar hipótese', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/estudos/${study.id}/diagnostico\\?scenarioId=`));
  const edited = await snapshot(page);
  expect(edited.profiles).toEqual(beforeProfiles);
  expect(edited.studies[0]!.scenarios).toHaveLength(6);
  expect(edited.studies[0]!.scenarios[0]!.inputFingerprint).toBe(study.scenarios[0]!.inputFingerprint);
  const hypothesis = study.diagnostics.find((item) => item.scenarioId === study.scenarios[1]!.id)!;
  await page.goto(`/comparar?studyId=${study.id}`);
  await page.getByLabel('Execução base').selectOption(base.id);
  await page.getByLabel('Execução da hipótese').selectOption(hypothesis.id);
  await page.getByRole('button', { name: 'Comparar', exact: true }).click();
  const comparison = await page.evaluate((ids) => (window.__MOTOR_E2E__ as unknown as AcceptanceBridge).compareDemoExecutions(...ids),
    [study.id, base.id, hypothesis.id] as const);
  expect(comparison.ok).toBe(false);
  await expect(page.getByRole('alert')).toContainText(comparison.reason!);
  const projected = await page.evaluate((input) => (window.__MOTOR_E2E__ as unknown as AcceptanceBridge).projectDemoCommunication(input), {
    studyId: study.id, scenarioId: base.scenarioId, diagnosticExecutionId: base.id,
    replayDay: 31,
  });
  expect(projected.selection.comparisonExecutionId).toBeNull();
  expect(projected.comparison).toBeNull();

  await page.goto(`/carteira/${study.id}`);
  const compatibleBuilder = page.getByRole('region', { name: 'Criar hipótese de composição' });
  await compatibleBuilder.getByLabel('Nome da hipótese').fill('Janela comparável B6');
  await compatibleBuilder.getByLabel('Janela em dias').fill('8');
  await compatibleBuilder.getByRole('button', { name: 'Criar hipótese', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/estudos/${study.id}/diagnostico\\?scenarioId=`));
  const comparableScenarioId = new URL(page.url()).searchParams.get('scenarioId')!;
  const before = await (await page.request.get('/__e2e__/diagnostics/state')).json() as { submitted: number };
  await page.evaluate(() => {
    const original = crypto.randomUUID.bind(crypto);
    let first = true;
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => {
      if (first) { first = false; return '00000000-0000-4000-8000-000000000111'; }
      return original();
    } });
  });
  await page.getByRole('button', { name: 'Executar diagnóstico', exact: true }).click();
  await releaseDiagnostics(page, 10, before.submitted);
  await expect(page.getByRole('heading', { name: 'Resultado do motor' })).toBeVisible();
  const comparable = (await snapshot(page)).studies[0]!.diagnostics.find((item) => item.scenarioId === comparableScenarioId);
  expect(comparable).toBeDefined();
  await page.goto(`/comparar?studyId=${study.id}`);
  await page.getByLabel('Execução base').selectOption(base.id);
  await page.getByLabel('Execução da hipótese').selectOption(comparable!.id);
  await page.getByRole('button', { name: 'Comparar', exact: true }).click();
  await expect(page.getByRole('heading', { name: '4. Exposição residual' })).toBeVisible();
  const compatible = await page.evaluate((ids) => (window.__MOTOR_E2E__ as unknown as AcceptanceBridge).compareDemoExecutions(...ids),
    [study.id, base.id, comparable!.id] as const);
  expect(compatible.ok).toBe(true);
  const comparedDocument = await page.evaluate((input) => (window.__MOTOR_E2E__ as unknown as AcceptanceBridge).projectDemoCommunication(input), {
    studyId: study.id, scenarioId: base.scenarioId, diagnosticExecutionId: base.id,
    comparisonExecutionId: comparable!.id, replayDay: 31,
  });
  expect(comparedDocument.selection.comparisonExecutionId).toBe(comparable!.id);
  const windowBefore = comparedDocument.comparison!.facts.find((item) => item.code.startsWith('WINDOW.') && item.code.endsWith('.before'));
  const windowAfter = comparedDocument.comparison!.facts.find((item) => item.code.startsWith('WINDOW.') && item.code.endsWith('.after'));
  expect([windowBefore?.value, windowAfter?.value]).toEqual(['7', '8']);
  await expect(page.getByRole('region', { name: 'Entradas alteradas' })).toContainText('Janela: 7 → 8');
  const remittedDelta = comparedDocument.comparison!.metrics.find((item) => item.code === 'CROSS_BORDER_RESIDUAL.remitted_brl.delta');
  expect(remittedDelta?.value).not.toBeNull();
  await expect(page.getByRole('row', { name: /Remetido/ })).toContainText(`${remittedDelta!.value} BRL`);
  const rendered = await page.locator('.comparison-axis').evaluateAll((sections) => sections.flatMap((section) => {
    const axis = section.querySelector('h2')?.textContent ?? '';
    return [...section.querySelectorAll('tbody tr')].map((row) => ({
      axis, label: row.querySelector('th')?.textContent ?? '',
      cells: [...row.querySelectorAll('td')].map((cell) => cell.textContent ?? ''),
    }));
  }));
  for (const metric of comparedDocument.comparison!.metrics) {
    const axis = metric.code.split('.')[0] as keyof typeof AXIS_TITLES;
    const label = metric.label.replace(/ \([^)]+\): (base|hypothesis|delta)$/, '');
    const side = metric.code.split('.').at(-1);
    const column = side === 'base' ? 0 : side === 'hypothesis' ? 1 : 2;
    const row = rendered.find((item) => item.axis === AXIS_TITLES[axis] && item.label === label);
    expect(row, metric.code).toBeDefined();
    expect(row!.cells[column], metric.code).toContain(metric.value ?? 'Indisponível');
    expect(metric.evidenceRefs.length).toBeGreaterThan(0);
    for (const ref of metric.evidenceRefs) expect(comparedDocument.evidenceIndex[ref]).toBeDefined();
  }
  const response = await page.request.get('/api/v1/catalogos/ajuda', {
    headers: { Authorization: 'Bearer mot21-controlled-e2e-token' },
  });
  expect(response.ok()).toBe(true);
  expect(response.headers()['cache-control']).toContain('no-store');
  const catalog = await response.json() as { items: readonly { id: string; purpose: string; changes: string; doesNotChange: string }[] };
  for (const id of ['concept.participante', 'concept.perfil', 'concept.repeticao', 'concept.replay', 'page.importacao']) {
    const item = catalog.items.find((entry) => entry.id === id);
    expect(item?.purpose).toBeTruthy();
    expect(item?.changes).toBeTruthy();
    expect(item?.doesNotChange).toBeTruthy();
  }
  expect(catalog.items.find((item) => item.id === 'concept.participante')?.doesNotChange).toContain('Perfil');
});
