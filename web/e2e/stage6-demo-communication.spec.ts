import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { runCanonicalDiagnostic } from './helpers/persistedDiagnostic';
import { seedWindowScenario, useDemoSamplingSeed } from './helpers/windowScenario';
import { formatFraction, formatMoney } from '../src/presentation/format';
import { loadDemoIfEmpty } from './helpers/demo';

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
  await loadDemoIfEmpty(page);
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

test('primeiro acesso começa vazio; carregar instala uma vez; remoção não ressuscita', async ({ page }) => {
  await page.goto('/estudos');
  await expect(page.getByRole('heading', { name: 'Estudos' })).toBeVisible();
  await expect.poll(() => bridge(page)).toBe(true);
  const empty = await snapshot(page);
  expect(empty.studies).toHaveLength(0);
  expect(empty.profiles).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Carregar estudo demonstrativo' })).toBeVisible();
  await loadDemoIfEmpty(page);
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
  await loadDemoIfEmpty(page);
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
  await page.getByRole('radio', { name: 'Carteira gerada (exemplo)' }).check();
  await page.getByRole('button', { name: 'Criar com carteira gerada' }).click();
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);
  const importedStudyId = page.url().split('/').at(-1)!;
  await page.getByRole('button', { name: 'Trocar origem' }).click();
  await page.getByRole('radio', { name: 'Dados importados de uma empresa' }).check();
  const caseId = new URL(profileUrl!, page.url()).searchParams.get('caseId')!;
  await page.getByLabel('Caso importado').selectOption(caseId);
  await page.getByRole('button', { name: 'Usar este caso' }).click();
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), importedStudyId)).toBe('OBSERVED_CASE');
  await runCanonicalDiagnostic(page, importedStudyId);
  expect(await page.evaluate((id) => window.__MOTOR_E2E__!.studyExecutionStatuses(id), importedStudyId)).toEqual(['QUEUED', 'SUCCEEDED']);
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
    await page.getByLabel('Selecionar dia').focus();
    await page.keyboard.press('Home');
    for (let day = 0; day < 31; day += 1) await page.keyboard.press('ArrowRight');
    await expect(page.getByLabel('Selecionar dia')).toHaveValue('31');
    await expect(page.getByRole('region', { name: 'Controles do Replay' }).getByText('D31', { exact: true })).toBeVisible();
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

test('variação de janela preserva Perfis; publicação compara diagnóstico compatível e explica incompatibilidade', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/estudos');
  const study = (await installedDemo(page)).studies[0]!;
  const base = study.diagnostics.find((item) => item.scenarioId === study.scenarios[0]!.id)!;
  const beforeProfiles = (await snapshot(page)).profiles;
  const incompatible = study.diagnostics.find((item) => item.scenarioId === study.scenarios[1]!.id)!;
  const comparison = await page.evaluate((ids) => (window.__MOTOR_E2E__ as unknown as AcceptanceBridge).compareDemoExecutions(...ids),
    [study.id, base.id, incompatible.id] as const);
  expect(comparison.ok).toBe(false);
  await page.goto(`/estudos/${study.id}/apresentacao?cenario=${base.scenarioId}&execucao=${base.id}&comparacao=${incompatible.id}`);
  expect(comparison.reason).toContain('incompatíveis');
  await expect(page.getByRole('alert')).toContainText('A comparação solicitada não corresponde');

  const comparableScenarioId = await seedWindowScenario(page, study.id);
  await page.goto(`/estudos/${study.id}/diagnostico?scenarioId=${comparableScenarioId}`);
  await expect(page.getByRole('heading', { name: 'Diagnóstico robusto' })).toBeVisible();
  await useDemoSamplingSeed(page);
  const before = await (await page.request.get('/__e2e__/diagnostics/state')).json() as { submitted: number };
  await page.getByRole('button', { name: 'Executar diagnóstico', exact: true }).click();
  await releaseDiagnostics(page, 10, before.submitted);
  await expect(page.getByRole('heading', { name: 'Resultado do motor' })).toBeVisible();
  const edited = await snapshot(page);
  expect(edited.profiles).toEqual(beforeProfiles);
  expect(edited.studies[0]!.scenarios).toHaveLength(6);
  expect(edited.studies[0]!.scenarios[0]!.inputFingerprint).toBe(study.scenarios[0]!.inputFingerprint);
  const comparable = edited.studies[0]!.diagnostics.find((item) => item.scenarioId === comparableScenarioId)!;
  const compatible = await page.evaluate((ids) => (window.__MOTOR_E2E__ as unknown as AcceptanceBridge).compareDemoExecutions(...ids),
    [study.id, base.id, comparable.id] as const);
  expect(compatible.ok).toBe(true);
  const comparedDocument = await page.evaluate((input) => (window.__MOTOR_E2E__ as unknown as AcceptanceBridge).projectDemoCommunication(input), {
    studyId: study.id, scenarioId: base.scenarioId, diagnosticExecutionId: base.id,
    comparisonExecutionId: comparable.id, replayDay: 31,
  });
  expect(comparedDocument.selection.comparisonExecutionId).toBe(comparable.id);
  const windowBefore = comparedDocument.comparison!.facts.find((item) => item.code.startsWith('WINDOW.') && item.code.endsWith('.before'));
  const windowAfter = comparedDocument.comparison!.facts.find((item) => item.code.startsWith('WINDOW.') && item.code.endsWith('.after'));
  expect([windowBefore?.value, windowAfter?.value]).toEqual(['7', '8']);
  for (const metric of comparedDocument.comparison!.metrics) {
    expect(metric.evidenceRefs.length).toBeGreaterThan(0);
    for (const ref of metric.evidenceRefs) expect(comparedDocument.evidenceIndex[ref]).toBeDefined();
  }
  await page.goto(`/estudos/${study.id}/apresentacao?cenario=${comparableScenarioId}&execucao=${comparable.id}&comparacao=${base.id}`);
  await expect(page.getByRole('heading', { name: study.name, level: 1 })).toBeVisible();
  const variations = page.getByRole('table', { name: 'Comparação entre o original e as variações' });
  await expect(variations.getByRole('row').filter({ hasText: 'Janela 8 dias' })).toContainText(formatMoney(comparable.savingsBrl));
  await expect(variations.getByRole('row').filter({ hasText: study.scenarios[0]!.name })).toContainText(formatMoney(base.savingsBrl));
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
