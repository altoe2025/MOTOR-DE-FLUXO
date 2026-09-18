import { parseWorkbook } from './xlsxParser';
import type {
  WorkerRequest,
  WorkerResponse,
} from './xlsxParser';
import {
  ImportFileError,
  type SerializedImportFileError,
} from './xlsxPreflight';

type WorkerScope = {
  onmessage:
    | ((event: MessageEvent<WorkerRequest>) => void)
    | null;
  postMessage(message: WorkerResponse): void;
};

const workerScope = self as unknown as WorkerScope;

function serializeError(error: unknown): SerializedImportFileError {
  if (error instanceof ImportFileError) {
    return {
      code: error.code,
      message: error.message,
    };
  }
  return {
    code: 'INVALID_XLSX',
    message: 'não foi possível processar o XLSX',
  };
}

workerScope.onmessage = async (
  event: MessageEvent<WorkerRequest>,
) => {
  const request = event.data;
  if (request.kind !== 'PARSE') {
    return;
  }
  try {
    const workbook = await parseWorkbook(
      request.buffer,
      {
        fileName: request.fileName,
        fileSize: request.fileSize,
      },
    );
    workerScope.postMessage({
      kind: 'SUCCESS',
      requestId: request.requestId,
      workbook,
    });
  } catch (error) {
    workerScope.postMessage({
      kind: 'FAILURE',
      requestId: request.requestId,
      error: serializeError(error),
    });
  }
};
