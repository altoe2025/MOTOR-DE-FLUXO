import { queryOptions } from '@tanstack/react-query';

import type { JobSnapshot } from '../api/client';

export const DIAGNOSTIC_POLL_INTERVAL_MS = 500;

export function diagnosticJobKey(
  ownerSub: string,
  studyId: string,
  attemptId: string,
  jobId: string,
) {
  return ['diagnostic-job', ownerSub, studyId, attemptId, jobId] as const;
}

export function shouldPollDiagnostic(snapshot: JobSnapshot | undefined): boolean {
  return snapshot === undefined
    || ['QUEUED', 'RUNNING', 'AGGREGATING', 'CANCEL_REQUESTED'].includes(snapshot.status);
}

export function diagnosticJobQueryOptions(input: Readonly<{
  ownerSub: string;
  studyId: string;
  attemptId: string;
  jobId: string;
  getDiagnosticJob(jobId: string, signal?: AbortSignal): Promise<JobSnapshot>;
}>) {
  return queryOptions({
    queryKey: diagnosticJobKey(input.ownerSub, input.studyId, input.attemptId, input.jobId),
    queryFn: ({ signal }) => input.getDiagnosticJob(input.jobId, signal),
    refetchInterval: (query) => shouldPollDiagnostic(query.state.data)
      ? DIAGNOSTIC_POLL_INTERVAL_MS
      : false,
  });
}
