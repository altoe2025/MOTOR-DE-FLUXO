import { describe, expect, it, vi } from 'vitest';

import type { JobSnapshot } from '../api/client';
import { diagnosticJobKey, diagnosticJobQueryOptions, shouldPollDiagnostic } from './queries';

const ACTIVE_JOB: JobSnapshot = {
  api_version: '1.0.0',
  job_id: '00000000-0000-4000-8000-000000000001',
  request_id: '00000000-0000-4000-8000-000000000002',
  status: 'RUNNING',
  progress: {
    completed: 1,
    failed: 0,
    total: 10,
    current_repetition_id: null,
    phase: 'EXECUTING',
    created_at: '2026-09-20T00:00:00.000Z',
    started_at: '2026-09-20T00:00:00.000Z',
    updated_at: '2026-09-20T00:00:01.000Z',
    finished_at: null,
  },
  error: null,
  retry_of_job_id: null,
};

describe('queries de diagnóstico', () => {
  it('isola cache por owner, estudo, tentativa e job', () => {
    expect(diagnosticJobKey('owner-a', 'study-a', 'attempt-a', 'job-a')).toEqual([
      'diagnostic-job', 'owner-a', 'study-a', 'attempt-a', 'job-a',
    ]);
    expect(diagnosticJobKey('owner-b', 'study-a', 'attempt-a', 'job-a')).not.toEqual(
      diagnosticJobKey('owner-a', 'study-a', 'attempt-a', 'job-a'),
    );
  });

  it('mantém polling apenas para estados ativos', () => {
    expect(shouldPollDiagnostic(ACTIVE_JOB)).toBe(true);
    expect(shouldPollDiagnostic({ ...ACTIVE_JOB, status: 'CANCEL_REQUESTED' })).toBe(true);
    expect(shouldPollDiagnostic({ ...ACTIVE_JOB, status: 'SUCCEEDED' })).toBe(false);
    expect(shouldPollDiagnostic(undefined)).toBe(true);
  });

  it('consulta apenas GET do job e desliga intervalo após terminal', async () => {
    const getDiagnosticJob = vi.fn().mockResolvedValue(ACTIVE_JOB);
    const options = diagnosticJobQueryOptions({
      ownerSub: 'owner-a', studyId: 'study-a', attemptId: 'attempt-a', jobId: 'job-a',
      getDiagnosticJob,
    });

    await options.queryFn?.({ signal: new AbortController().signal } as never);

    expect(getDiagnosticJob).toHaveBeenCalledWith('job-a', expect.any(AbortSignal));
    const interval = options.refetchInterval;
    if (typeof interval !== 'function') throw new Error('intervalo deve ser dinâmico');
    expect(interval({ state: { data: ACTIVE_JOB } } as never)).toBe(500);
    expect(interval({ state: { data: { ...ACTIVE_JOB, status: 'FAILED' } } } as never)).toBe(false);
  });
});
