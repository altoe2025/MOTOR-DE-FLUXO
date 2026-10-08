import { describe, expect, it, vi } from 'vitest';

import { parseCanonicalXlsx } from './workerClient';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly sent: { message: unknown; transfer: Transferable[] }[] = [];
  terminated = false;

  constructor() { FakeWorker.instances.push(this); }

  postMessage(message: unknown, transfer: Transferable[] = []): void {
    this.sent.push({ message, transfer });
  }

  terminate(): void { this.terminated = true; }

  emit(data: unknown): void { this.onmessage?.({ data } as MessageEvent<unknown>); }
}

function file(): File {
  return new File([new Uint8Array([1, 2, 3, 4])], 'operacoes.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    lastModified: 1_800_000_000_000,
  });
}

describe('parseCanonicalXlsx', () => {
  it.each([
    ['operacoes.csv', 4, 'FILE_NOT_XLSX'],
    ['operacoes.xlsx', 5 * 1024 * 1024 + 1, 'FILE_TOO_LARGE'],
  ])('rejects %s before reading bytes or creating a worker', async (name, byteLength, code) => {
    FakeWorker.instances = [];
    const source = new File([new Uint8Array(byteLength)], name);
    const arrayBuffer = vi.spyOn(source, 'arrayBuffer');

    await expect(parseCanonicalXlsx(source, new AbortController().signal)).rejects.toMatchObject({ code });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('transfers the buffer and resolves only serializable parsed output', async () => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    const pending = parseCanonicalXlsx(file(), new AbortController().signal);

    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    const worker = FakeWorker.instances[0];
    expect(worker?.sent[0]?.transfer).toHaveLength(1);

    worker?.emit({ kind: 'SUCCESS', requestId: (worker.sent[0]?.message as { requestId: string }).requestId,
      parsed: { layout: 'xlsx-operacoes/1.0.0', sha256: '0'.repeat(64), byteSize: 4, rows: [] } });
    await expect(pending).resolves.toEqual({ layout: 'xlsx-operacoes/1.0.0', sha256: '0'.repeat(64), byteSize: 4, rows: [] });
    expect(worker?.terminated).toBe(true);
    vi.unstubAllGlobals();
  });

  it('aborts the worker and ignores a late success', async () => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    const controller = new AbortController();
    const pending = parseCanonicalXlsx(file(), controller.signal);

    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    const worker = FakeWorker.instances[0];
    const requestId = (worker?.sent[0]?.message as { requestId: string }).requestId;
    controller.abort();
    worker?.emit({ kind: 'SUCCESS', requestId, parsed: { layout: 'xlsx-operacoes/1.0.0', sha256: '0'.repeat(64), byteSize: 4, rows: [] } });

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker?.terminated).toBe(true);
    vi.unstubAllGlobals();
  });
});
