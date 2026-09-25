import { parseXlsxBuffer, type WorkerRequest, type WorkerResponse } from './xlsxParser';
import { ImportFileError, type SerializedImportFileError } from './xlsxPreflight';

type WorkerScope = { onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null; postMessage(message: WorkerResponse): void };
const workerScope = self as unknown as WorkerScope;

function serializeError(error: unknown): SerializedImportFileError {
  return error instanceof ImportFileError
    ? { code: error.code, message: error.message }
    : { code: 'INVALID_XLSX', message: 'não foi possível processar o XLSX' };
}

workerScope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.kind !== 'PARSE') return;
  try {
    workerScope.postMessage({ kind: 'SUCCESS', requestId: event.data.requestId, parsed: await parseXlsxBuffer(event.data.buffer) });
  } catch (error) {
    workerScope.postMessage({ kind: 'FAILURE', requestId: event.data.requestId, error: serializeError(error) });
  }
};
