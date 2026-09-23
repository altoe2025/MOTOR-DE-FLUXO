import type { ParsedImport, WorkerRequest, WorkerResponse } from './xlsxParser';
import { ImportFileError } from './xlsxPreflight';

function abortError(): DOMException { return new DOMException('Importação cancelada', 'AbortError'); }
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function preflightFile(file: File): void {
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new ImportFileError('FILE_NOT_XLSX', 'somente arquivos .xlsx são permitidos');
  if (file.size > MAX_FILE_BYTES) throw new ImportFileError('FILE_TOO_LARGE', 'o XLSX excede 5 MiB');
}

/** The only public entry point that accepts a browser File. */
export async function parseCanonicalXlsx(file: File, signal: AbortSignal): Promise<ParsedImport> {
  if (signal.aborted) throw abortError();
  preflightFile(file);
  const buffer = await file.arrayBuffer();
  if (signal.aborted) throw abortError();
  const worker = new Worker(new URL('./xlsx.worker.ts', import.meta.url), { type: 'module' });
  const requestId = globalThis.crypto.randomUUID();
  return new Promise<ParsedImport>((resolve, reject) => {
    let done = false;
    const finish = (callback: () => void) => {
      if (done) return;
      done = true;
      signal.removeEventListener('abort', onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      callback();
    };
    const onAbort = () => finish(() => reject(abortError()));
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      if (response.requestId !== requestId) return;
      if (response.kind === 'SUCCESS') finish(() => resolve(response.parsed));
      else finish(() => reject(new ImportFileError(response.error.code, response.error.message)));
    };
    worker.onerror = () => finish(() => reject(new ImportFileError('WORKER_FAILURE', 'falha inesperada no worker de importação')));
    signal.addEventListener('abort', onAbort, { once: true });
    const request: WorkerRequest = { kind: 'PARSE', requestId, buffer };
    try { worker.postMessage(request, [buffer]); } catch (error) { finish(() => reject(error)); }
  });
}
