import { expect, test, type Page, type Request } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { strToU8, unzipSync, zipSync } from 'fflate';

const OWNER = '00000000-0000-4000-8000-000000000021';
const OWNER_B = '00000000-0000-4000-8000-000000000022';
const SOURCE_NAME = 'somente-local-sentinela.xlsx';
const RAW_CLIENT = 'CLIENTE_BRUTO_SENTINELA';
const RAW_PROFILE = 'PERFIL_BRUTO_SENTINELA';
const headers = ['operacao_id', 'cliente_nome', 'classificacao_perfil', 'direcao', 'data_conhecida', 'data_limite', 'valor_brl'];
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../src/importer/__fixtures__/${name}`, import.meta.url)));
const normalRows = [
  ['E2E-OUT', RAW_CLIENT, RAW_PROFILE, 'OUT', '01/01/2026', '03/01/2026', '100,00'],
  ['E2E-IN', RAW_CLIENT, RAW_PROFILE, 'IN', '01/01/2026', '03/01/2026', '100,00'],
];

/** Reuses the audited minimal OOXML fixture; adds only synthetic inline cells. */
function workbook(rows = normalRows): Buffer {
  const entries = unzipSync(fixture('valid-minimal.xlsx'));
  const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const xmlRows = [headers, ...rows].map((row, index) => `<row r="${index + 1}">${row.map((value, col) => `<c r="${String.fromCharCode(65 + col)}${index + 1}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`).join('')}</row>`).join('');
  entries['xl/worksheets/sheet1.xml'] = strToU8(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xmlRows}</sheetData></worksheet>`);
  return Buffer.from(zipSync(entries, { mtime: new Date('2020-01-01T00:00:00Z') }));
}

function captureRequests(page: Page) {
  const captured: Array<{ url: string; contentType: string; body: string | null }> = [];
  page.on('request', (request: Request) => captured.push({ url: request.url(), contentType: request.headers()['content-type'] ?? '', body: request.postData() }));
  return captured;
}

async function storage(page: Page, owner = OWNER) {
  return page.evaluate(async (ownerSub) => {
    const info = (await indexedDB.databases()).find((item) => item.name === `motor-fluxo:app:v2:local:${ownerSub}`);
    if (info?.name === undefined) throw new Error('Banco da conta não inicializado.');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(info.name!);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const forbidden: string[] = [];
    const inspect = (value: unknown, path: string): void => {
      if (value instanceof Blob || value instanceof File || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) { forbidden.push(path); return; }
      if (typeof value === 'string' && (/^PK\u0003\u0004/.test(value) || /<(?:\?xml|worksheet|workbook)(?:\s|>)/i.test(value))) forbidden.push(path);
      if (value !== null && typeof value === 'object') for (const [key, item] of Object.entries(value)) inspect(item, `${path}/${key}`);
    };
    try {
      const stores: Record<string, Array<{ document?: Record<string, unknown>; [key: string]: unknown }>> = {};
      const transaction = database.transaction([...database.objectStoreNames], 'readonly');
      await Promise.all([...database.objectStoreNames].map(async (name) => {
        const rows = await new Promise<Array<{ document?: Record<string, unknown> }>>((resolve, reject) => {
          const request = transaction.objectStore(name).getAll();
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        inspect(rows, name); stores[name] = rows;
      }));
      return { stores, forbidden };
    } finally { database.close(); }
  }, owner);
}

async function assertPrivate(page: Page, requests: ReturnType<typeof captureRequests>) {
  const saved = await storage(page);
  expect(saved.forbidden).toEqual([]);
  for (const serialized of [JSON.stringify(saved.stores), JSON.stringify(requests)]) {
    for (const raw of [SOURCE_NAME, RAW_CLIENT, RAW_PROFILE, 'cliente_nome', 'classificacao_perfil', 'CELULA_INVALIDA_SENTINELA']) expect(serialized).not.toContain(raw);
  }
  for (const request of requests) {
    expect(request.contentType).not.toMatch(/spreadsheet|zip|multipart/i);
    expect(request.body ?? '').not.toMatch(/^PK\x03\x04|<(?:\?xml|worksheet|workbook)(?:\s|>)/i);
  }
  return saved.stores;
}

async function selectFile(page: Page, buffer: Buffer, companyId?: string) {
  await page.goto(companyId === undefined ? '/importar' : `/empresas/${companyId}/importar`);
  if (companyId === undefined) {
    await page.getByLabel('Nome da nova empresa').fill('Empresa aceite XLSX');
    await page.getByRole('button', { name: 'Usar nova empresa neste Caso' }).click();
  }
  await page.getByLabel('Planilha canônica XLSX').setInputFiles({ name: SOURCE_NAME, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
  await page.getByRole('checkbox', { name: /operações explícitas/ }).check();
  await expect(page.getByRole('heading', { name: 'Revisar operações' })).toHaveCount(0);
}

async function readAndConfirm(page: Page, buffer = workbook(), companyId?: string) {
  await selectFile(page, buffer, companyId);
  await page.getByRole('button', { name: 'Ler planilha' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar operações' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar Caso Observado' }).click();
  await expect(page.getByRole('heading', { name: 'Caso confirmado' })).toBeVisible();
  const link = await page.getByRole('link', { name: 'Criar Perfil Operacional' }).getAttribute('href');
  const url = new URL(link!, page.url());
  return { companyId: url.pathname.split('/')[2]!, caseId: url.searchParams.get('caseId')!, profileUrl: url.pathname + url.search };
}

test('Caso observado: finalidade opcional preserva privacidade até prévia e diagnóstico após reload', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const requests = captureRequests(page);
  await page.goto('/importar');
  await expect(page.getByRole('heading', { name: 'Fonte e empresa' })).toBeVisible();
  const before = await storage(page);
  const imported = await readAndConfirm(page);
  const afterCase = await assertPrivate(page, requests);
  const savedCase = afterCase.observed_cases!.find((row) => row.case_id === imported.caseId)!.document!;
  expect(savedCase.orders).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'E2E-IN', direction: 'IN', valueBrl: '100', purposeCode: null, efxStatus: 'NOT_COLLECTED', fieldProvenance: expect.objectContaining({ purposeCode: expect.objectContaining({ kind: 'NOT_COLLECTED' }) }) }),
    expect.objectContaining({ id: 'E2E-OUT', direction: 'OUT', valueBrl: '100', purposeCode: null, efxStatus: 'NOT_COLLECTED', fieldProvenance: expect.objectContaining({ purposeCode: expect.objectContaining({ kind: 'NOT_COLLECTED' }) }) }),
  ]));
  expect(afterCase.observed_cases).toHaveLength(before.stores.observed_cases!.length + 1);
  expect(afterCase.studies).toHaveLength(before.stores.studies!.length);
  expect(afterCase.profile_versions).toHaveLength(before.stores.profile_versions!.length);
  expect(requests.filter((request) => /\/(?:previas|diagnosticos|replays)$/.test(request.url))).toHaveLength(0);
  await page.getByRole('link', { name: 'Abrir Caso', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('row', { name: /2026-01-01 a 2026-01-03/ })).toContainText('R$ 100,00');
  await page.goto(imported.profileUrl);
  await expect(page.getByRole('region', { name: 'Prévia do Perfil Operacional' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar versão' }).click();
  await expect(page.getByRole('heading', { name: 'Versão 1' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Versão 1' })).toBeVisible();
  await page.goto('/estudos');
  await page.getByRole('button', { name: 'Novo estudo', exact: true }).click();
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);
  const studyId = page.url().split('/').at(-1)!;
  await page.getByRole('radio', { name: 'Caso observado', exact: true }).check();
  await page.getByLabel('Caso confirmado').selectOption(imported.caseId);
  await page.getByRole('button', { name: 'Usar caso confirmado' }).click();
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), studyId)).toBe('OBSERVED_CASE');
  await page.goto(imported.profileUrl);
  await page.getByLabel('Estudo para receber a evidência').selectOption(studyId);
  await page.getByRole('button', { name: 'Usar como evidência em estudo' }).click();
  await expect(page.getByText(/Perfil v1 anexado/)).toBeVisible();
  await page.reload();
  expect(await page.evaluate((id) => window.__MOTOR_E2E__!.profileSnapshot(id), studyId)).toEqual({ attachedVersions: [1], availableVersions: [1] });
  await page.goto(`/carteira/${studyId}`);
  await page.getByRole('button', { name: 'Executar cenário atual' }).click();
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studyExecutionStatuses(id), studyId)).toEqual(['RUNNING', 'SUCCEEDED']);
  const snapshot = await page.evaluate((id) => window.__MOTOR_E2E__!.stage4Snapshot(id), studyId);
  await page.goto(`/estudos/${studyId}/diagnostico?scenarioId=${snapshot.baseScenarioId}`);
  await page.getByRole('button', { name: 'Executar diagnóstico', exact: true }).click();
  await expect.poll(async () => (await page.request.get('/__e2e__/diagnostics/state')).json()).toMatchObject({ pending: 1 });
  expect((await page.request.post('/__e2e__/diagnostics/release', { data: { fail: false } })).ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Resultado do motor' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir Replay · Fronteira Viva' })).toBeVisible();
  expect(await page.evaluate((id) => window.__MOTOR_E2E__!.studyExecutionStatuses(id), studyId)).toEqual(['RUNNING', 'SUCCEEDED', 'QUEUED', 'SUCCEEDED']);
  expect(requests.filter((request) => /\/(?:previas|diagnosticos)$/.test(request.url) && request.body !== null)).toHaveLength(2);
  const canonicalBodies = requests.filter((request) => /\/(?:previas|diagnosticos)$/.test(request.url)).map((request) => request.body ?? '');
  for (const body of canonicalBodies) expect(body).toContain('"finalidade":null');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Diagnóstico robusto' })).toBeVisible();
  await assertPrivate(page, requests);
  const privacyPath = testInfo.outputPath('import-privacy-summary.json');
  writeFileSync(privacyPath, JSON.stringify({ requests: requests.map(({ url, contentType, body }) => ({ path: new URL(url).pathname, contentType, bodyBytes: Buffer.byteLength(body ?? '') })), caseId: imported.caseId, studyId }, null, 2));
  await testInfo.attach('import-privacy-summary', { contentType: 'application/json', path: privacyPath });
});

test('Caso observado: ancestralidade XLSX permite autoria com finalidade sem regra após reload', async ({ page }) => {
  const requests = captureRequests(page);
  const imported = await readAndConfirm(page);
  await page.goto('/estudos');
  await page.getByRole('button', { name: 'Novo estudo', exact: true }).click();
  await expect(page).toHaveURL(/\/carteira\/[0-9a-f-]+$/);
  const studyId = page.url().split('/').at(-1)!;
  await page.getByRole('radio', { name: 'Caso observado', exact: true }).check();
  await page.getByLabel('Caso confirmado').selectOption(imported.caseId);
  await page.getByRole('button', { name: 'Usar caso confirmado' }).click();
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), studyId)).toBe('OBSERVED_CASE');
  await page.getByRole('button', { name: 'Converter para autoria manual' }).click();
  for (const [id, direction] of [['E2E-IN', 'OUT'], ['E2E-OUT', 'IN']] as const) {
    for (const [field, value] of [
      ['ID', `edited-${id}`], ['Cliente', `edited-client-${id}`], ['Dia conhecido', '1'],
      ['Dia limite', '4'], ['Valor BRL', '120'], ['Finalidade', 'FINALIDADE_FICTICIA_EDITADA'],
    ]) await page.getByLabel(`${field} da operação ${id}`, { exact: true }).fill(value!);
    await page.getByLabel(`Direção da operação ${id}`).selectOption(direction);
    await page.getByLabel(`EFX da operação ${id}`, { exact: true }).check();
  }
  await page.getByRole('button', { name: 'Salvar operações explícitas' }).click();
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studySource(id), studyId)).toBe('AUTHORED');
  await expect.poll(async () => JSON.stringify((await storage(page)).stores.studies)).toContain('FINALIDADE_FICTICIA_EDITADA');
  await page.reload();
  await expect(page.getByLabel('ID da operação edited-E2E-IN', { exact: true })).toHaveValue('edited-E2E-IN');
  await page.getByRole('button', { name: 'Executar cenário atual' }).click();
  await expect.poll(() => page.evaluate((id) => window.__MOTOR_E2E__!.studyExecutionStatuses(id), studyId)).toEqual(['RUNNING', 'SUCCEEDED']);
  const previews = requests.filter((request) => /\/previas$/.test(request.url) && request.body !== null);
  expect(previews).toHaveLength(1);
  expect(previews[0]!.body).toContain('FINALIDADE_FICTICIA_EDITADA');
  await assertPrivate(page, requests);
});

test('linha inválida e conflito bloqueiam publicação; correção, escolha e cancelamento preservam atomicidade', async ({ page }) => {
  const requests = captureRequests(page);
  const rows = [...normalRows.map((row) => [...row]), [...normalRows[0]!]];
  rows[1]![6] = 'CELULA_INVALIDA_SENTINELA'; rows[2]![6] = '80,00';
  await selectFile(page, workbook(rows));
  const before = await storage(page);
  await page.getByRole('button', { name: 'Ler planilha' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar operações' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar Caso Observado' })).toBeDisabled();
  expect((await storage(page)).stores).toEqual(before.stores);
  await page.getByRole('row').filter({ hasText: 'E2E-IN' }).getByRole('button', { name: 'Corrigir', exact: true }).click();
  await page.getByLabel('Campo', { exact: true }).selectOption('valueBrl');
  await page.getByLabel('Valor corrigido').fill('100,00');
  await page.getByRole('button', { name: 'Aplicar correção' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar Caso Observado' })).toBeDisabled();
  await page.getByLabel('Versão a manter').selectOption({ index: 1 });
  await expect(page.getByRole('button', { name: 'Confirmar Caso Observado' })).toBeEnabled();
  await page.getByRole('button', { name: 'Cancelar importação' }).click();
  await expect(page.getByRole('heading', { name: 'Fonte e empresa' })).toBeVisible();
  expect((await assertPrivate(page, requests))).toEqual(before.stores);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Revisar operações' })).toHaveCount(0);
});

test('correção confirmada persiste auditoria canônica e elimina a célula inválida', async ({ page }) => {
  const requests = captureRequests(page);
  const rows = normalRows.map((row) => [...row]);
  rows[1]![6] = 'CELULA_INVALIDA_SENTINELA';
  await selectFile(page, workbook(rows));
  await page.getByRole('button', { name: 'Ler planilha' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar Caso Observado' })).toBeDisabled();
  await page.getByRole('row').filter({ hasText: 'E2E-IN' }).getByRole('button', { name: 'Corrigir', exact: true }).click();
  await page.getByLabel('Campo', { exact: true }).selectOption('valueBrl');
  await page.getByLabel('Valor corrigido').fill('100,00');
  await page.getByRole('button', { name: 'Aplicar correção' }).click();
  await page.getByRole('button', { name: 'Confirmar Caso Observado' }).click();
  await expect(page.getByRole('heading', { name: 'Caso confirmado' })).toBeVisible();
  const saved = await assertPrivate(page, requests);
  expect(saved.import_events).toEqual([expect.objectContaining({ document: expect.objectContaining({ kind: 'OPERATION_CORRECTED', audit: { originalValue: null, previousValue: null, nextValue: '100' } }) })]);
  await page.reload();
  await assertPrivate(page, requests);
});

test('OOXML proibido e cancelamento durante worker não publicam entidades parciais', async ({ page }) => {
  const requests = captureRequests(page);
  await selectFile(page, fixture('formula.xlsx'));
  const before = await storage(page);
  await page.getByRole('button', { name: 'Ler planilha' }).click();
  await expect(page.getByRole('alert')).toContainText(/fórmula/i);
  expect((await storage(page)).stores).toEqual(before.stores);
  let releaseWorker!: () => void;
  const workerGate = new Promise<void>((resolve) => { releaseWorker = resolve; });
  await page.route('**/xlsx.worker-*.js', async (route) => { await workerGate; await route.continue().catch(() => undefined); });
  await page.getByLabel('Planilha canônica XLSX').setInputFiles({ name: SOURCE_NAME, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbook() });
  await page.getByRole('button', { name: 'Ler planilha' }).click();
  await page.getByRole('button', { name: 'Cancelar leitura' }).click();
  releaseWorker();
  await expect(page.getByRole('heading', { name: 'Revisar operações' })).toHaveCount(0);
  expect((await assertPrivate(page, requests))).toEqual(before.stores);
});

test('duas abas disputam o mesmo Caso; uma confirma e a conta B não lê os dados da conta A', async ({ page, context }) => {
  const imported = await readAndConfirm(page);
  const second = await context.newPage();
  const changed = workbook(normalRows.map((row) => [row[0]! + '-2', ...row.slice(1)]));
  await Promise.all([selectFile(page, changed, imported.companyId), selectFile(second, changed, imported.companyId)]);
  await Promise.all([page, second].map(async (tab) => {
    await tab.getByRole('button', { name: 'Ler planilha' }).click();
    await expect(tab.getByRole('button', { name: 'Confirmar Caso Observado' })).toBeEnabled();
  }));
  const before = await storage(page);
  await Promise.all([page, second].map((tab) => tab.getByRole('button', { name: 'Confirmar Caso Observado' }).click()));
  await expect.poll(async () => (await storage(page)).stores.observed_cases!.length).toBe(before.stores.observed_cases!.length + 1);
  await expect.poll(async () => (await page.getByRole('heading', { name: 'Caso confirmado' }).count()) + (await second.getByRole('heading', { name: 'Caso confirmado' }).count())).toBe(1);
  const loser = await page.getByRole('heading', { name: 'Caso confirmado' }).count() === 1 ? second : page;
  await expect(loser.getByRole('alert')).toContainText('Revisão esperada 0, revisão atual 1');
  const after = await storage(page);
  expect(after.stores.import_batches).toHaveLength(before.stores.import_batches!.length + 1);
  expect(after.stores.operations).toHaveLength(before.stores.operations!.length + 1);
  await second.evaluate(() => localStorage.setItem('motor-fluxo:e2e-account', 'b'));
  await second.goto(`/empresas/${imported.companyId}/casos`);
  await expect(second.getByRole('heading', { name: 'Empresa não encontrada' })).toBeVisible();
  const accountB = await storage(second, OWNER_B);
  // B has its own synthetic demo installed; its imported portfolio is empty.
  expect(accountB.stores.observed_cases!.filter((row) => (row.document?.sourceManifest as { sourceKind: string }).sourceKind === 'XLSX')).toEqual([]);
  expect(accountB.stores.observed_cases!.some((row) => row.company_id === imported.companyId)).toBe(false);
  expect(accountB.stores.import_batches).toEqual([]);
  await second.evaluate(() => localStorage.setItem('motor-fluxo:e2e-account', 'a'));
  await second.reload();
  await expect(second.getByRole('heading', { name: 'Casos de Empresa aceite XLSX' })).toBeVisible();
  expect((await storage(second)).stores.observed_cases).toEqual(after.stores.observed_cases);
});

test('1.000 linhas são importadas no worker; registra latência, long tasks, heap e bytes sem prometer Replay', async ({ page, browser }, testInfo) => {
  const requests = captureRequests(page);
  await page.addInitScript(() => {
    const measurements = { workerStart: 0, workerMs: 0, longTasks: [] as Array<{ startTime: number; duration: number }> };
    Object.defineProperty(window, '__importMeasurement', { value: measurements });
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('xlsx.worker')) {
          measurements.workerStart = performance.now();
          this.addEventListener('message', () => { measurements.workerMs = performance.now() - measurements.workerStart; });
        }
      }
    };
    new PerformanceObserver((list) => measurements.longTasks.push(...list.getEntries().map((entry) => ({ startTime: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true });
  });
  const input = fixture('valid-1000-rows.xlsx');
  await selectFile(page, input);
  const started = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: 'Ler planilha' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar operações' })).toBeVisible();
  const measured = await page.evaluate((start) => {
    const metrics = (window as typeof window & { __importMeasurement: { workerMs: number; longTasks: Array<{ startTime: number; duration: number }> } }).__importMeasurement;
    return { reviewMs: performance.now() - start, workerMs: metrics.workerMs, mainThreadLongTasksMs: metrics.longTasks.filter((entry) => entry.startTime >= start).map((entry) => entry.duration), heapApproxBytes: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null, userAgent: navigator.userAgent, logicalProcessors: navigator.hardwareConcurrency };
  }, started);
  expect(measured.workerMs).toBeGreaterThan(0);
  expect(measured.reviewMs).toBeLessThan(5000);
  await expect(page.getByRole('table', { name: 'Linhas importadas' }).getByRole('row')).toHaveCount(1001);
  await page.getByRole('button', { name: 'Confirmar Caso Observado' }).click();
  await expect(page.getByRole('heading', { name: 'Caso confirmado' })).toBeVisible();
  const saved = await assertPrivate(page, requests);
  const record = saved.observed_cases!.find((row) => (row.document?.orders as unknown[])?.length === 1000)!;
  expect(record).toBeDefined();
  const report = { ...measured, browserVersion: browser.version(), fixtureSha256: createHash('sha256').update(input).digest('hex'), xlsxBytes: input.byteLength, caseJsonBytes: Buffer.byteLength(JSON.stringify(record.document)), importedOrders: 1000, executionRequests: requests.filter((request) => /\/(?:previas|diagnosticos|replays)$/.test(request.url)).length, replay1000Claimed: false, replaySeparateLimit: 'DIAGNOSTIC_PROVENANCE_MAX_500; Etapa 5 mediu 98 ordens × 365 dias', parserWorkerObserved: measured.workerMs > 0 };
  expect(report.executionRequests).toBe(0);
  const measurementPath = testInfo.outputPath('import-1000-measurement.json');
  writeFileSync(measurementPath, JSON.stringify(report, null, 2));
  await testInfo.attach('import-1000-measurement', { contentType: 'application/json', path: measurementPath });
  console.log('IMPORT_1000_MEASUREMENT', JSON.stringify(report));
});
