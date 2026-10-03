export type DiagnosticPoolProgress = Readonly<{
  total: number;
  scheduled: number;
  /** Scheduled items not yet settled, including those awaiting their local commit. */
  active: number;
  completed: number;
  failed: number;
  /** Queued items that became current elsewhere or stale before taking a remote slot. */
  skipped: number;
}>;

type TerminalOutcome = Readonly<{
  attempt: Readonly<{ status: string; error: Readonly<{ message: string }> | null }>;
}>;

/** Two remote slots with a serial, bounded commit queue. Cancellation only gates scheduling. */
export async function runDiagnosticPool<Item, Result extends TerminalOutcome>(
  items: readonly Item[],
  options: Readonly<{
    concurrency: 2;
    compute(item: Item, signal: AbortSignal): Promise<Result>;
    commit(result: Result): Promise<unknown>;
    shouldSchedule(): boolean;
    shouldCompute?(item: Item): boolean;
    signal: AbortSignal;
    onProgress(progress: DiagnosticPoolProgress): void;
  }>,
): Promise<DiagnosticPoolProgress> {
  if (options.concurrency !== 2) throw new Error('O lote exige concorrência de dois diagnósticos.');
  let next = 0;
  let firstFailure: unknown;
  let failed = false;
  let commitFailed = false;
  let commitTail = Promise.resolve();
  let progress: DiagnosticPoolProgress = { total: items.length, scheduled: 0, active: 0, completed: 0, failed: 0, skipped: 0 };
  const publish = (delta: Partial<DiagnosticPoolProgress>) => {
    progress = { ...progress, ...delta };
    options.onProgress(progress);
  };
  const fail = (error: unknown) => {
    if (!failed) firstFailure = error;
    failed = true;
  };
  const worker = async () => {
    while (!failed && !options.signal.aborted && next < items.length && options.shouldSchedule()) {
      const item = items[next++]!;
      try {
        if (options.shouldCompute?.(item) === false) {
          publish({ skipped: progress.skipped + 1 });
          continue;
        }
      } catch (error) {
        fail(error);
        return;
      }
      publish({ scheduled: progress.scheduled + 1, active: progress.active + 1 });
      let succeeded = false;
      try {
        const result = await options.compute(item, options.signal);
        options.signal.throwIfAborted();
        const terminalFailed = result.attempt.status !== 'SUCCEEDED';
        if (terminalFailed) fail(new Error(result.attempt.error?.message ?? 'O diagnóstico não foi concluído.'));
        const commit = commitTail.then(async () => {
          options.signal.throwIfAborted();
          if (commitFailed) throw firstFailure;
          try { await options.commit(result); }
          catch (error) { commitFailed = true; fail(error); throw error; }
        });
        // A rejected commit must not produce an unhandled queue rejection.
        commitTail = commit.catch(() => {});
        await commit;
        succeeded = !terminalFailed;
      } catch (error) {
        fail(error);
      } finally {
        publish({ active: progress.active - 1,
          completed: progress.completed + (succeeded ? 1 : 0),
          failed: progress.failed + (succeeded ? 0 : 1) });
      }
    }
  };
  publish({});
  await Promise.all([worker(), worker()]);
  options.signal.throwIfAborted();
  if (failed) throw firstFailure;
  return progress;
}
