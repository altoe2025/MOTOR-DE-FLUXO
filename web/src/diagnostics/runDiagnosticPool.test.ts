import { describe, expect, it, vi } from 'vitest';
import { runDiagnosticPool, type DiagnosticPoolProgress } from './runDiagnosticPool';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function result(id: number, status: 'SUCCEEDED' | 'FAILED' = 'SUCCEEDED') {
  return { id, attempt: { status, error: status === 'FAILED' ? { code: 'FAILED', message: 'Falha remota.' } : null } };
}

describe('runDiagnosticPool', () => {
  it('skips newly ineligible queued items without compute, commit or a remote slot', async () => {
    const pending = deferred<ReturnType<typeof result>>();
    let eligible = true;
    const progress: DiagnosticPoolProgress[] = [];
    const compute = vi.fn(async (id: number) => { await pending.promise; return result(id); });
    const commit = vi.fn(async () => { eligible = false; });
    const pool = runDiagnosticPool([0, 1, 2, 3], {
      concurrency: 2, signal: new AbortController().signal, shouldSchedule: () => true,
      shouldCompute: () => eligible, compute, commit, onProgress: (value) => progress.push(value),
    });
    expect(compute).toHaveBeenCalledTimes(2);
    pending.resolve(result(0));
    await pool;
    expect(compute).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledTimes(2);
    expect(progress.at(-1)).toEqual({ total: 4, scheduled: 2, active: 0, completed: 2, failed: 0, skipped: 2 });
    progress.forEach((value, index) => {
      expect(value.total).toBe(4);
      expect(value.scheduled).toBe(value.active + value.completed + value.failed);
      expect(value.scheduled + value.skipped).toBeLessThanOrEqual(value.total);
      for (const key of ['scheduled', 'completed', 'failed', 'skipped'] as const) {
        expect(value[key]).toBeGreaterThanOrEqual(progress[index - 1]?.[key] ?? 0);
      }
    });
  });
  it('limits compute to two, serializes commits in completion order and reports monotonic settled counts', async () => {
    const computes = [deferred<ReturnType<typeof result>>(), deferred<ReturnType<typeof result>>(), deferred<ReturnType<typeof result>>()];
    const firstCommit = deferred<void>();
    const scheduled: number[] = [];
    const committed: number[] = [];
    const progress: DiagnosticPoolProgress[] = [];
    let activeCompute = 0;
    let peakCompute = 0;
    let activeCommit = 0;
    let peakCommit = 0;
    const pool = runDiagnosticPool([0, 1, 2], {
      concurrency: 2, signal: new AbortController().signal, shouldSchedule: () => true,
      compute: async (id) => {
        scheduled.push(id); peakCompute = Math.max(peakCompute, ++activeCompute);
        const value = await computes[id]!.promise; activeCompute--; return value;
      },
      commit: async (value) => {
        peakCommit = Math.max(peakCommit, ++activeCommit); committed.push(value.id);
        if (value.id === 1) await firstCommit.promise;
        activeCommit--;
      },
      onProgress: (value) => progress.push(value),
    });
    expect(scheduled).toEqual([0, 1]);
    computes[1]!.resolve(result(1));
    await vi.waitFor(() => expect(committed).toEqual([1]));
    computes[0]!.resolve(result(0));
    await Promise.resolve();
    expect(committed).toEqual([1]);
    firstCommit.resolve();
    await vi.waitFor(() => expect(scheduled).toEqual([0, 1, 2]));
    computes[2]!.resolve(result(2));
    await pool;
    expect(committed).toEqual([1, 0, 2]);
    expect(peakCompute).toBe(2);
    expect(peakCommit).toBe(1);
    expect(progress.at(-1)).toEqual({ total: 3, scheduled: 3, active: 0, completed: 3, failed: 0, skipped: 0 });
    progress.forEach((value, index) => {
      expect(value.total).toBe(3);
      expect(value.active + value.completed + value.failed).toBe(value.scheduled);
      for (const key of ['scheduled', 'completed', 'failed'] as const) {
        expect(value[key]).toBeGreaterThanOrEqual(progress[index - 1]?.[key] ?? 0);
      }
    });
  });

  it.each(['throw', 'terminal'] as const)('stops scheduling on %s failure and drains both received terminals before rejecting', async (failure) => {
    const first = deferred<ReturnType<typeof result>>();
    const second = deferred<ReturnType<typeof result>>();
    const committed: number[] = [];
    const scheduled: number[] = [];
    const pool = runDiagnosticPool([0, 1, 2], {
      concurrency: 2, signal: new AbortController().signal, shouldSchedule: () => true,
      compute: (id) => { scheduled.push(id); return id === 0 ? first.promise : second.promise; },
      commit: async (value) => { committed.push(value.id); }, onProgress: () => {},
    });
    const rejection = expect(pool).rejects.toThrow(/Falha/);
    if (failure === 'throw') first.reject(new Error('Falha de rede.'));
    else first.resolve(result(0, 'FAILED'));
    await vi.waitFor(() => expect(committed).toEqual(failure === 'throw' ? [] : [0]));
    second.resolve(result(1));
    await rejection;
    expect(scheduled).toEqual([0, 1]);
    expect(committed).toEqual(failure === 'throw' ? [1] : [0, 1]);
  });

  it('scheduling cancellation keeps active signals alive and commits both active results', async () => {
    const pending = deferred<ReturnType<typeof result>>();
    const abort = new AbortController();
    let scheduling = true;
    const committed: number[] = [];
    const compute = vi.fn(async (id: number, signal: AbortSignal) => {
      await pending.promise;
      expect(signal.aborted).toBe(false);
      return result(id);
    });
    const pool = runDiagnosticPool([0, 1, 2], { concurrency: 2, signal: abort.signal,
      shouldSchedule: () => scheduling, compute, commit: async (value) => { committed.push(value.id); },
      onProgress: () => {} });
    scheduling = false;
    pending.resolve(result(0));
    await pool;
    expect(compute).toHaveBeenCalledTimes(2);
    expect(committed).toEqual([0, 1]);
  });

  it('navigation abort reaches active computes and prevents all late commits', async () => {
    const pending = deferred<ReturnType<typeof result>>();
    const abort = new AbortController();
    const signals: AbortSignal[] = [];
    const commit = vi.fn();
    const pool = runDiagnosticPool([0, 1, 2], { concurrency: 2, signal: abort.signal,
      shouldSchedule: () => true, compute: (_id, signal) => { signals.push(signal); return pending.promise; },
      commit, onProgress: () => {} });
    const rejection = expect(pool).rejects.toMatchObject({ name: 'AbortError' });
    abort.abort();
    pending.resolve(result(0));
    await rejection;
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(commit).not.toHaveBeenCalled();
  });

  it('stops further writes and submissions after a commit fails, while draining active computation', async () => {
    const pending = deferred<ReturnType<typeof result>>();
    const commit = vi.fn(async () => { throw new Error('Conflito persistente.'); });
    const compute = vi.fn((id: number) => id === 0 ? Promise.resolve(result(id)) : pending.promise);
    const pool = runDiagnosticPool([0, 1, 2], { concurrency: 2, signal: new AbortController().signal,
      shouldSchedule: () => true, compute, commit, onProgress: () => {} });
    const rejection = expect(pool).rejects.toThrow('Conflito persistente.');
    await vi.waitFor(() => expect(commit).toHaveBeenCalledOnce());
    pending.resolve(result(1));
    await rejection;
    expect(compute).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledOnce();
  });
});
