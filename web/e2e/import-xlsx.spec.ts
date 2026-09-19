import { expect, test, type Page, type Request } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

async function selectUser(page: Page, user: 'A' | 'B'): Promise<void> {
  await page.goto('/carteira');
  await page.evaluate((selected) => localStorage.setItem('motor-fluxo:e2e-user', selected), user);
  await page.reload();
}

async function openImporter(page: Page): Promise<void> {
  await page.goto('/carteira');
  await page.getByRole('link', { name: 'Criar importação' }).click();
  await expect(page.getByRole('heading', { name: 'Importar XLSX' })).toBeFocused();
}

async function importFile(page: Page, name: string): Promise<void> {
  await page.getByLabel('Arquivo XLSX').setInputFiles(fixture(name));
  await expect(page.getByText(`Selecionado: ${name}`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Revisar operações' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Ler planilha' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar operações' })).toBeVisible();
}

async function reachConfirmation(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Definir recorte e parâmetros' }).click();
  await expect(page.getByText(/ainda não foram calibrados/i)).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Confirmar execução' })).toBeVisible();
}

function capturePreviewRequests(page: Page): Array<{ request: Request; body: string }> {
  const requests: Array<{ request: Request; body: string }> = [];
  page.on('request', (request) => {
    const contentType = request.headers()['content-type'] ?? '';
    expect(contentType).not.toContain('spreadsheetml');
    if (request.url().endsWith('/api/v1/previas')) requests.push({ request, body: request.postData() ?? '' });
  });
  return requests;
}

async function storedBinaryViolations(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const violations: string[] = [];
    const inspect = (value: unknown, path: string, seen = new Set<object>()): void => {
      if (value instanceof Blob || value instanceof File || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) { violations.push(path); return; }
      if (typeof value === 'string' && value.startsWith('PK')) { violations.push(`${path}:zip`); return; }
      if (value === null || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      for (const [key, child] of Object.entries(value)) inspect(child, `${path}.${key}`, seen);
    };
    for (const info of await indexedDB.databases()) {
      if (info.name === undefined || !info.name.startsWith('motor-fluxo:imports:')) continue;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(info.name as string);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      for (const storeName of Array.from(database.objectStoreNames)) {
        const records = await new Promise<unknown[]>((resolve, reject) => {
          const request = database.transaction(storeName).objectStore(storeName).getAll();
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        records.forEach((record, index) => inspect(record, `${storeName}[${index}]`));
      }
      database.close();
    }
    return violations;
  });
}

test.beforeEach(async ({ page }) => selectUser(page, 'A'));

test('executa carteira fictícia, protege a fronteira local e restaura o diagnóstico', async ({ page }) => {
  const previewRequests = capturePreviewRequests(page);
  await openImporter(page);
  await importFile(page, 'valid-balanced.xlsx');
  await reachConfirmation(page);
  expect(previewRequests).toHaveLength(0);
  await page.getByRole('button', { name: 'Executar 2 operações' }).click();
  await expect(page).toHaveURL(/\/diagnostico\?study=[0-9a-f-]+&execution=[0-9a-f-]+$/);
  await expect(page.getByRole('group', { name: 'Autonetting — mesmo participante' })).toBeVisible();
  expect(previewRequests).toHaveLength(1);
  const requestBody = previewRequests[0]?.body ?? '';
  expect(new TextEncoder().encode(requestBody).byteLength).toBeLessThan(1_048_576);
  expect(requestBody).not.toContain('valid-balanced.xlsx');
  expect(requestBody).not.toContain('cliente_nome');
  expect(requestBody).not.toContain('Cliente Fictício Balanceado');
  expect(requestBody).not.toContain('classificacao_perfil');
  expect(requestBody).not.toContain('PK');
  expect(await storedBinaryViolations(page)).toEqual([]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Diagnóstico' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Autonetting — mesmo participante' })).toBeVisible();
});

test('exige confirmação parcial, resolve conflito e desfaz o lote', async ({ page }) => {
  await openImporter(page);
  await importFile(page, 'partial-invalid.xlsx');
  await page.getByRole('button', { name: 'Inválidas' }).click();
  await expect(page.getByText(/linhas inválidas preservadas/i)).toBeVisible();
  await reachConfirmation(page);
  await expect(page.getByRole('button', { name: 'Executar apenas 2 operações' })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Revisar operações' })).toBeVisible();
  await page.getByRole('button', { name: 'Importar outro lote' }).click();
  await importFile(page, 'conflicting-batch.xlsx');
  await expect(page.getByRole('alert')).toHaveText(/Conflito em TESTE-OUT/);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Usar versão/ }).first().click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Desfazer último lote' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('processa mil linhas no worker em até cinco segundos sem request acima de 1 MiB', async ({ page }) => {
  await openImporter(page);
  await page.evaluate(() => {
    const durations: number[] = [];
    new PerformanceObserver((list) => list.getEntries().forEach((entry) => durations.push(entry.duration)))
      .observe({ type: 'longtask', buffered: true });
    Object.defineProperty(window, '__motImportLongTasks', { value: durations });
  });
  const startedAt = Date.now();
  await importFile(page, 'valid-1000-rows.xlsx');
  const elapsedMs = Date.now() - startedAt;
  expect(elapsedMs).toBeLessThanOrEqual(5_000);
  const longTasks = await page.evaluate(() => (window as typeof window & { __motImportLongTasks: number[] }).__motImportLongTasks);
  expect(longTasks.filter((duration) => duration > 100)).toEqual([]);
  await reachConfirmation(page);
  const requestPromise = page.waitForRequest((request) => request.url().endsWith('/api/v1/previas'));
  await page.getByRole('button', { name: 'Executar 1000 operações' }).click();
  const request = await requestPromise;
  const requestBytes = new TextEncoder().encode(request.postData() ?? '').byteLength;
  expect(requestBytes).toBeLessThan(1_048_576);
  console.log(`import_xlsx_1000 elapsed_ms=${elapsedMs} request_bytes=${requestBytes}`);
});

test('CAS impede sobrescrita entre abas e IndexedDB isola contas', async ({ page }) => {
  await openImporter(page);
  await importFile(page, 'valid-balanced.xlsx');
  const studyUrl = page.url();
  const second = await page.context().newPage();
  await selectUser(second, 'A');
  await second.goto(studyUrl);
  await page.getByRole('button', { name: 'Editar' }).first().click();
  await page.getByLabel(/Finalidade de/).fill('TESTE_OUT');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await second.getByRole('button', { name: 'Editar' }).first().click();
  await second.getByLabel(/Finalidade de/).fill('TESTE_OUT');
  await second.getByRole('button', { name: 'Salvar' }).click();
  await expect(second.getByRole('alert')).toHaveText(/REVISION_CONFLICT/);
  await second.close();
  await page.evaluate(() => localStorage.setItem('motor-fluxo:e2e-user', 'B'));
  await page.reload();
  await expect(page.getByText('Nenhuma importação local.')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('motor-fluxo:e2e-user', 'A'));
  await page.reload();
  await expect(page.getByText('valid-balanced')).toBeVisible();
});
