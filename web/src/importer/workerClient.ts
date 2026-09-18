import type {
  ParsedWorkbook,
  WorkerRequest,
  WorkerResponse,
} from './xlsxParser';
import { ImportFileError } from './xlsxPreflight';

export interface ImporterWorkerClient {
  parse(
    file: File,
    signal?: AbortSignal,
  ): Promise<ParsedWorkbook>;
  dispose(): void;
}

type ActiveRequest = {
  worker: Worker;
  reject: (reason: unknown) => void;
  cleanup: () => void;
};

function abortError(): DOMException {
  return new DOMException('Importação cancelada', 'AbortError');
}

function ensureNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw abortError();
  }
}

export function createImporterWorkerClient(
  workerFactory: () => Worker = () => new Worker(
    new URL('./xlsx.worker.ts', import.meta.url),
    { type: 'module' },
  ),
): ImporterWorkerClient {
  let active: ActiveRequest | null = null;

  return {
    async parse(
      file: File,
      signal?: AbortSignal,
    ): Promise<ParsedWorkbook> {
      if (active !== null) {
        throw new ImportFileError(
          'WORKER_FAILURE',
          'já existe uma importação em andamento',
        );
      }
      ensureNotAborted(signal);

      const buffer = await file.arrayBuffer();
      ensureNotAborted(signal);
      const worker = workerFactory();
      const requestId = globalThis.crypto.randomUUID();

      return new Promise<ParsedWorkbook>((resolve, reject) => {
        const cleanup = () => {
          signal?.removeEventListener('abort', onAbort);
          worker.onmessage = null;
          worker.onerror = null;
          if (active?.worker === worker) {
            active = null;
          }
        };
        const finish = (
          callback: () => void,
        ) => {
          cleanup();
          worker.terminate();
          callback();
        };
        const onAbort = () => {
          finish(() => reject(abortError()));
        };

        worker.onmessage = (
          event: MessageEvent<WorkerResponse>,
        ) => {
          const response = event.data;
          if (response.requestId !== requestId) {
            return;
          }
          if (response.kind === 'SUCCESS') {
            finish(() => resolve(response.workbook));
          } else {
            finish(() => reject(new ImportFileError(
              response.error.code,
              response.error.message,
            )));
          }
        };
        worker.onerror = () => {
          finish(() => reject(new ImportFileError(
            'WORKER_FAILURE',
            'falha inesperada no worker de importação',
          )));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        active = { worker, reject, cleanup };

        const request: WorkerRequest = {
          kind: 'PARSE',
          requestId,
          buffer,
          fileName: file.name,
          fileSize: file.size,
          fileLastModified: file.lastModified,
        };
        try {
          worker.postMessage(request, [buffer]);
        } catch (error) {
          finish(() => reject(error));
        }
      });
    },

    dispose(): void {
      if (active === null) {
        return;
      }
      const current = active;
      current.cleanup();
      current.worker.terminate();
      current.reject(abortError());
    },
  };
}
