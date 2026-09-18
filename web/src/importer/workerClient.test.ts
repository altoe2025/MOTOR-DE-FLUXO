import { describe, expect, it, vi } from 'vitest';

import type {
  ParsedWorkbook,
  WorkerRequest,
  WorkerResponse,
} from './xlsxParser';
import { createImporterWorkerClient } from './workerClient';

type SentMessage = {
  message: WorkerRequest;
  transfer: Transferable[];
};

class FakeWorker {
  onmessage:
    | ((event: MessageEvent<WorkerResponse>) => void)
    | null = null;

  onerror:
    | ((event: ErrorEvent) => void)
    | null = null;

  readonly sent: SentMessage[] = [];
  readonly terminate = vi.fn();

  postMessage(
    message: WorkerRequest,
    transfer: Transferable[] = [],
  ): void {
    this.sent.push({ message, transfer });
  }

  emit(response: WorkerResponse): void {
    this.onmessage?.({
      data: response,
    } as MessageEvent<WorkerResponse>);
  }
}

function xlsxFile(): File {
  return new File(
    [new Uint8Array([1, 2, 3, 4])],
    'operacoes.xlsx',
    {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      lastModified: 1_800_000_000_000,
    },
  );
}

function parsedWorkbook(): ParsedWorkbook {
  return {
    sheetName: 'operacoes',
    metadata: {
      fileName: 'operacoes.xlsx',
      fileSize: 4,
      sha256: '0'.repeat(64),
    },
    rows: [],
  };
}

describe('createImporterWorkerClient', () => {
  it('transfere o ArrayBuffer ao worker sem cloná-lo', async () => {
    const worker = new FakeWorker();
    const client = createImporterWorkerClient(
      () => worker as unknown as Worker,
    );

    const promise = client.parse(xlsxFile());

    await vi.waitFor(() => {
      expect(worker.sent).toHaveLength(1);
    });

    const sent = worker.sent[0];
    expect(sent?.message.kind).toBe('PARSE');
    expect(sent?.transfer).toHaveLength(1);
    expect(sent?.transfer[0]).toBe(sent?.message.buffer);

    worker.emit({
      kind: 'SUCCESS',
      requestId: sent?.message.requestId ?? '',
      workbook: parsedWorkbook(),
    });

    await expect(promise).resolves.toEqual(parsedWorkbook());
  });

  it('envia nome e tamanho no protocolo discriminado', async () => {
    const worker = new FakeWorker();
    const client = createImporterWorkerClient(
      () => worker as unknown as Worker,
    );

    const promise = client.parse(xlsxFile());
    await vi.waitFor(() => expect(worker.sent).toHaveLength(1));

    const request = worker.sent[0]?.message;
    expect(request).toMatchObject({
      kind: 'PARSE',
      fileName: 'operacoes.xlsx',
      fileSize: 4,
      requestId: expect.any(String),
    });

    worker.emit({
      kind: 'SUCCESS',
      requestId: request?.requestId ?? '',
      workbook: parsedWorkbook(),
    });
    await promise;
  });

  it('propaga erro estruturado retornado pelo worker', async () => {
    const worker = new FakeWorker();
    const client = createImporterWorkerClient(
      () => worker as unknown as Worker,
    );

    const promise = client.parse(xlsxFile());
    await vi.waitFor(() => expect(worker.sent).toHaveLength(1));

    worker.emit({
      kind: 'FAILURE',
      requestId: worker.sent[0]?.message.requestId ?? '',
      error: {
        code: 'FORMULA_NOT_ALLOWED',
        message: 'Fórmulas não são permitidas',
      },
    });

    await expect(promise).rejects.toMatchObject({
      code: 'FORMULA_NOT_ALLOWED',
    });
  });

  it('cancela a leitura, termina o worker e retorna AbortError', async () => {
    const worker = new FakeWorker();
    const client = createImporterWorkerClient(
      () => worker as unknown as Worker,
    );
    const controller = new AbortController();

    const promise = client.parse(xlsxFile(), controller.signal);
    await vi.waitFor(() => expect(worker.sent).toHaveLength(1));
    controller.abort();

    await expect(promise).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('cria um worker novo depois de um cancelamento', async () => {
    const firstWorker = new FakeWorker();
    const secondWorker = new FakeWorker();
    const workers = [firstWorker, secondWorker];
    const factory = vi.fn(
      () => workers.shift() as unknown as Worker,
    );
    const client = createImporterWorkerClient(factory);
    const controller = new AbortController();

    const first = client.parse(xlsxFile(), controller.signal);
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });

    const second = client.parse(xlsxFile());
    await vi.waitFor(() => {
      expect(factory).toHaveBeenCalledTimes(2);
      expect(secondWorker.sent).toHaveLength(1);
    });
    const request = secondWorker.sent[0]?.message;
    secondWorker.emit({
      kind: 'SUCCESS',
      requestId: request?.requestId ?? '',
      workbook: parsedWorkbook(),
    });

    await expect(second).resolves.toEqual(parsedWorkbook());
  });

  it('dispose encerra o worker ativo', async () => {
    const worker = new FakeWorker();
    const client = createImporterWorkerClient(
      () => worker as unknown as Worker,
    );

    void client.parse(xlsxFile()).catch(() => undefined);
    await vi.waitFor(() => expect(worker.sent).toHaveLength(1));
    client.dispose();

    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
