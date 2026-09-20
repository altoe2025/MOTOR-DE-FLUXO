import { describe, expect, it, vi } from 'vitest';

import type { DiagnosticRequest, JobSnapshot } from '../api/client';
import { ApiError } from '../api/errors';
import { createStudy } from '../study/domain';
import { makeScenarioDraft } from '../study/fixtures';
import type { StudyDocument } from '../study/model';
import { buildDiagnosticRequest } from './buildDiagnosticRequest';
import {
  cancelStudyDiagnostic,
  executeStudyDiagnostic,
  retryStudyDiagnostic,
  type DiagnosticStudyAuthority,
} from './diagnosticExecutionService';

const OWNER = 'owner-a';
const STUDY_ID = '00000000-0000-4000-8000-000000000401';
const SCENARIO_ID = '00000000-0000-4000-8000-000000000402';
const JOB_ID = '00000000-0000-4000-8000-000000000403';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000404';
const RESERVATION_ID = '00000000-0000-4000-8000-000000000405';
const TERMINAL_ID = '00000000-0000-4000-8000-000000000406';
const NOW = '2026-09-20T12:00:00Z';

async function studyFixture(): Promise<{ study: StudyDocument; request: DiagnosticRequest }> {
  const study = await createStudy({
    id: STUDY_ID,
    ownerSub: OWNER,
    name: 'Diagnóstico',
    baseScenario: makeScenarioDraft({ id: SCENARIO_ID }),
    now: NOW,
  });
  const scenario = study.scenarios[0]!;
  const request = await buildDiagnosticRequest({
    requestId: '00000000-0000-4000-8000-000000000407',
    idempotencyKey: JOB_ID,
    studyId: study.id,
    scenario,
    count: 1,
    baseSeed: 'service',
    previewRequest: {
      api_version: '1.0.0',
      request_id: '00000000-0000-4000-8000-000000000408',
      study_id: study.id,
      scenario_id: scenario.id,
      scenario_revision: scenario.revision,
      cenario: {
        ordens: structuredClone(scenario.sourceSnapshot.orders),
        custo: structuredClone(scenario.premises.costs) as DiagnosticRequest['sampling'] extends never ? never : never,
        janela_dias: scenario.premises.windowDays,
        horizonte_dias: 30,
      },
      periodo: structuredClone(scenario.period.httpPeriod),
      proveniencia: {},
    } as never,
  });
  return { study, request };
}

function snapshot(status: JobSnapshot['status'], request: DiagnosticRequest): JobSnapshot {
  const terminal = status === 'FAILED' || status === 'CANCELLED' || status === 'SUCCEEDED';
  return {
    api_version: '1.0.0',
    job_id: request.idempotency_key,
    request_id: request.request_id,
    status,
    progress: {
      completed: terminal ? 1 : 0,
      failed: status === 'FAILED' ? 1 : 0,
      total: 1,
      current_repetition_id: null,
      phase: terminal ? 'TERMINAL' : 'QUEUED',
      created_at: NOW,
      started_at: terminal ? NOW : null,
      updated_at: NOW,
      finished_at: terminal ? NOW : null,
    },
    retry_of_job_id: null,
    error: status === 'FAILED'
      ? { code: 'DIAGNOSTICO_INVALIDO', message: 'Falha controlada.', repetition_id: null }
      : null,
  };
}

class AuthorityDouble implements DiagnosticStudyAuthority {
  snapshot: DiagnosticStudyAuthority['snapshot'];
  readonly edits: StudyDocument[] = [];
  readonly detached: StudyDocument[] = [];
  readonly abort = new AbortController();

  constructor(document: StudyDocument) {
    this.snapshot = { ownerSub: document.ownerSub, sessionEpoch: 1, document };
  }

  async flush(): Promise<StudyDocument | null> { return this.snapshot.document; }
  edit(document: StudyDocument): void {
    this.edits.push(document);
    this.snapshot = { ...this.snapshot, document };
  }
  async saveDetachedStudy(document: StudyDocument): Promise<StudyDocument | null> {
    this.detached.push(document);
    return document;
  }
  async runForCurrentSession<T>(
    work: (session: Readonly<{ ownerSub: string; epoch: number; signal: AbortSignal }>) => Promise<T>,
  ): Promise<T | null> {
    const ownerSub = this.snapshot.ownerSub!;
    const epoch = this.snapshot.sessionEpoch;
    const result = await work({ ownerSub, epoch, signal: this.abort.signal });
    return this.abort.signal.aborted || this.snapshot.ownerSub !== ownerSub
      || this.snapshot.sessionEpoch !== epoch ? null : result;
  }
}

function idFactory(...values: string[]): () => string {
  const ids = [...values];
  return () => ids.shift()!;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve, reject };
}

async function reservedFixture() {
  const { study, request } = await studyFixture();
  const preparingAuthority = new AuthorityDouble(study);
  const pending = deferred<JobSnapshot>();
  const preparing = executeStudyDiagnostic({
    authority: preparingAuthority,
    scenarioId: SCENARIO_ID,
    buildRequest: async () => request,
    api: {
      submitDiagnostic: vi.fn().mockResolvedValue(snapshot('QUEUED', request)),
      getDiagnosticJob: vi.fn().mockReturnValue(pending.promise),
      getDiagnosticResult: vi.fn(),
    },
    nextId: idFactory(ATTEMPT_ID, RESERVATION_ID),
    now: () => NOW,
    waitForNextPoll: async () => undefined,
  });
  await vi.waitFor(() => expect(preparingAuthority.edits).toHaveLength(1));
  preparingAuthority.abort.abort();
  pending.resolve(snapshot('RUNNING', request));
  await preparing;
  return { request, reserved: preparingAuthority.edits[0]! };
}

describe('executeStudyDiagnostic', () => {
  it('persiste somente reserva e terminal, sem snapshots de progresso', async () => {
    const { study, request } = await studyFixture();
    const authority = new AuthorityDouble(study);
    const submitDiagnostic = vi.fn().mockResolvedValue(snapshot('QUEUED', request));
    const getDiagnosticJob = vi.fn()
      .mockResolvedValueOnce(snapshot('RUNNING', request))
      .mockResolvedValueOnce(snapshot('FAILED', request));

    const result = await executeStudyDiagnostic({
      authority,
      scenarioId: SCENARIO_ID,
      buildRequest: async () => request,
      api: { submitDiagnostic, getDiagnosticJob, getDiagnosticResult: vi.fn() },
      nextId: vi.fn(idFactory(ATTEMPT_ID, RESERVATION_ID, TERMINAL_ID)),
      now: () => NOW,
      waitForNextPoll: async () => undefined,
    });

    expect(result.status).toBe('FAILED');
    expect(submitDiagnostic).toHaveBeenCalledOnce();
    expect(authority.edits).toHaveLength(2);
    expect(authority.edits[0]!.executions.map((item) => item.status)).toEqual(['QUEUED']);
    expect(authority.edits[1]!.executions.map((item) => item.status)).toEqual(['QUEUED', 'FAILED']);
  });

  it('retoma reserva persistida pelo jobId sem repetir POST', async () => {
    const { study, request } = await studyFixture();
    const first = new AuthorityDouble(study);
    const api = {
      submitDiagnostic: vi.fn().mockResolvedValue(snapshot('QUEUED', request)),
      getDiagnosticJob: vi.fn().mockResolvedValue(snapshot('FAILED', request)),
      getDiagnosticResult: vi.fn(),
    };
    await executeStudyDiagnostic({
      authority: first, scenarioId: SCENARIO_ID, buildRequest: async () => request, api,
      nextId: vi.fn(idFactory(ATTEMPT_ID, RESERVATION_ID, TERMINAL_ID)), now: () => NOW,
      waitForNextPoll: async () => undefined,
    });
    const reservedOnly = first.edits[0]!;
    const reloaded = new AuthorityDouble(reservedOnly);
    api.submitDiagnostic.mockClear();

    await executeStudyDiagnostic({
      authority: reloaded, scenarioId: SCENARIO_ID, buildRequest: async () => request, api,
      nextId: vi.fn(() => TERMINAL_ID), now: () => NOW, waitForNextPoll: async () => undefined,
    });

    expect(api.submitDiagnostic).not.toHaveBeenCalled();
    expect(api.getDiagnosticJob).toHaveBeenCalledWith(JOB_ID, expect.any(AbortSignal));
  });

  it('converte 404 de reserva ativa em interrupção rastreável', async () => {
    const { study, request } = await studyFixture();
    const authority = new AuthorityDouble(study);
    const api = {
      submitDiagnostic: vi.fn().mockResolvedValue(snapshot('QUEUED', request)),
      getDiagnosticJob: vi.fn().mockRejectedValue(new ApiError({
        status: 404, code: 'JOB_NAO_ENCONTRADO', message: 'ausente',
      })),
      getDiagnosticResult: vi.fn(),
    };

    const result = await executeStudyDiagnostic({
      authority, scenarioId: SCENARIO_ID, buildRequest: async () => request, api,
      nextId: vi.fn(idFactory(ATTEMPT_ID, RESERVATION_ID, TERMINAL_ID)), now: () => NOW,
      waitForNextPoll: async () => undefined,
    });

    expect(result).toMatchObject({ status: 'INTERRUPTED', error: { code: 'SERVER_RESTART_OR_JOB_EXPIRED' } });
    expect(authority.edits.at(-1)?.executions.at(-1)).toMatchObject({
      status: 'INTERRUPTED', error: { code: 'SERVER_RESTART_OR_JOB_EXPIRED' },
    });
  });

  it('converte 404 do resultado após SUCCEEDED em interrupção rastreável', async () => {
    const { study, request } = await studyFixture();
    const authority = new AuthorityDouble(study);

    const result = await executeStudyDiagnostic({
      authority,
      scenarioId: SCENARIO_ID,
      buildRequest: async () => request,
      api: {
        submitDiagnostic: vi.fn().mockResolvedValue(snapshot('QUEUED', request)),
        getDiagnosticJob: vi.fn().mockResolvedValue(snapshot('SUCCEEDED', request)),
        getDiagnosticResult: vi.fn().mockRejectedValue(new ApiError({
          status: 404, code: 'JOB_NAO_ENCONTRADO', message: 'resultado expirou',
        })),
      },
      nextId: idFactory(ATTEMPT_ID, RESERVATION_ID, TERMINAL_ID),
      now: () => NOW,
      waitForNextPoll: async () => undefined,
    });

    expect(result).toMatchObject({
      status: 'INTERRUPTED', error: { code: 'SERVER_RESTART_OR_JOB_EXPIRED' },
    });
    expect(authority.edits.at(-1)?.executions.at(-1)).toMatchObject({
      status: 'INTERRUPTED', error: { code: 'SERVER_RESTART_OR_JOB_EXPIRED' },
    });
  });

  it('mantém erro não-404 do resultado sem fabricar terminal local', async () => {
    const { study, request } = await studyFixture();
    const authority = new AuthorityDouble(study);
    const responseError = new ApiError({
      status: 503, code: 'SERVICO_INDISPONIVEL', message: 'Tente novamente mais tarde.',
    });

    await expect(executeStudyDiagnostic({
      authority,
      scenarioId: SCENARIO_ID,
      buildRequest: async () => request,
      api: {
        submitDiagnostic: vi.fn().mockResolvedValue(snapshot('QUEUED', request)),
        getDiagnosticJob: vi.fn().mockResolvedValue(snapshot('SUCCEEDED', request)),
        getDiagnosticResult: vi.fn().mockRejectedValue(responseError),
      },
      nextId: idFactory(ATTEMPT_ID, RESERVATION_ID, TERMINAL_ID),
      now: () => NOW,
      waitForNextPoll: async () => undefined,
    })).rejects.toBe(responseError);
    expect(authority.edits).toHaveLength(1);
    expect(authority.detached).toHaveLength(0);
  });

  it('404 tardio do resultado não grava após novo epoch da mesma conta', async () => {
    const { study, request } = await studyFixture();
    const authority = new AuthorityDouble(study);
    const resultResponse = deferred<never>();
    const execution = executeStudyDiagnostic({
      authority,
      scenarioId: SCENARIO_ID,
      buildRequest: async () => request,
      api: {
        submitDiagnostic: vi.fn().mockResolvedValue(snapshot('QUEUED', request)),
        getDiagnosticJob: vi.fn().mockResolvedValue(snapshot('SUCCEEDED', request)),
        getDiagnosticResult: vi.fn().mockReturnValue(resultResponse.promise),
      },
      nextId: idFactory(ATTEMPT_ID, RESERVATION_ID, TERMINAL_ID),
      now: () => NOW,
      waitForNextPoll: async () => undefined,
    });
    await vi.waitFor(() => expect(authority.edits).toHaveLength(1));
    await vi.waitFor(() => expect(authority.snapshot.document?.executions).toHaveLength(1));
    authority.snapshot = { ...authority.snapshot, sessionEpoch: 2 };
    resultResponse.reject(new ApiError({
      status: 404, code: 'JOB_NAO_ENCONTRADO', message: 'resultado expirou',
    }));

    const result = await execution;

    expect(result).toMatchObject({ status: 'INTERRUPTED', current: false });
    expect(authority.edits).toHaveLength(1);
    expect(authority.detached).toHaveLength(0);
  });

  it('descarta resposta tardia depois da troca de conta sem cancelar o job remoto', async () => {
    const { study, request } = await studyFixture();
    const authority = new AuthorityDouble(study);
    let release!: (value: JobSnapshot) => void;
    const pending = new Promise<JobSnapshot>((resolve) => { release = resolve; });
    const api = {
      submitDiagnostic: vi.fn().mockResolvedValue(snapshot('QUEUED', request)),
      getDiagnosticJob: vi.fn().mockReturnValue(pending),
      getDiagnosticResult: vi.fn(),
    };
    const execution = executeStudyDiagnostic({
      authority, scenarioId: SCENARIO_ID, buildRequest: async () => request, api,
      nextId: idFactory(ATTEMPT_ID, RESERVATION_ID, TERMINAL_ID), now: () => NOW,
      waitForNextPoll: async () => undefined,
    });
    await vi.waitFor(() => expect(authority.edits).toHaveLength(1));
    authority.snapshot = { ownerSub: 'owner-b', sessionEpoch: 2, document: null };
    authority.abort.abort();
    release(snapshot('FAILED', request));

    const result = await execution;
    expect(result).toMatchObject({ status: 'INTERRUPTED', current: false });
    expect(authority.edits).toHaveLength(1);
    expect(api).not.toHaveProperty('cancelDiagnostic');
  });

  it.each(['owner', 'epoch', 'abort'] as const)(
    'não grava terminal se autoridade %s muda enquanto flush terminal aguarda',
    async (change) => {
      const { request, reserved } = await reservedFixture();
      const authority = new AuthorityDouble(reserved);
      const terminalFlush = deferred<StudyDocument | null>();
      let flushCount = 0;
      authority.flush = vi.fn(async () => {
        flushCount += 1;
        if (flushCount === 2) return terminalFlush.promise;
        return authority.snapshot.document;
      });
      const execution = executeStudyDiagnostic({
        authority,
        scenarioId: SCENARIO_ID,
        buildRequest: async () => request,
        api: {
          submitDiagnostic: vi.fn(),
          getDiagnosticJob: vi.fn().mockResolvedValue(snapshot('FAILED', request)),
          getDiagnosticResult: vi.fn(),
        },
        nextId: () => TERMINAL_ID,
        now: () => NOW,
        waitForNextPoll: async () => undefined,
      });
      await vi.waitFor(() => expect(flushCount).toBe(2));
      if (change === 'owner') {
        authority.snapshot = { ownerSub: 'owner-b', sessionEpoch: 2, document: null };
      } else if (change === 'epoch') {
        authority.snapshot = { ...authority.snapshot, sessionEpoch: 2 };
      } else {
        authority.abort.abort();
      }
      terminalFlush.resolve(authority.snapshot.document);

      const result = await execution;

      expect(result).toMatchObject({ status: 'INTERRUPTED', current: false });
      expect(authority.edits).toHaveLength(0);
      expect(authority.detached).toHaveLength(0);
    },
  );

  it('persiste terminal por CAS no estudo de origem depois da troca de estudo', async () => {
    const { study, request } = await studyFixture();
    const authority = new AuthorityDouble(study);
    const other = await createStudy({
      id: '00000000-0000-4000-8000-000000000499', ownerSub: OWNER, name: 'Outro',
      baseScenario: makeScenarioDraft({ id: '00000000-0000-4000-8000-000000000498' }), now: NOW,
    });
    const api = {
      submitDiagnostic: vi.fn().mockResolvedValue(snapshot('QUEUED', request)),
      getDiagnosticJob: vi.fn().mockImplementation(async () => {
        authority.snapshot = { ...authority.snapshot, document: other };
        return snapshot('FAILED', request);
      }),
      getDiagnosticResult: vi.fn(),
    };

    await executeStudyDiagnostic({
      authority, scenarioId: SCENARIO_ID, buildRequest: async () => request, api,
      nextId: idFactory(ATTEMPT_ID, RESERVATION_ID, TERMINAL_ID), now: () => NOW,
      waitForNextPoll: async () => undefined,
    });

    expect(authority.snapshot.document?.id).toBe(other.id);
    expect(authority.detached).toHaveLength(1);
    expect(authority.detached[0]?.executions.map((item) => item.status)).toEqual(['QUEUED', 'FAILED']);
  });

  it('não persiste resposta de job divergente da reserva', async () => {
    const { study, request } = await studyFixture();
    const authority = new AuthorityDouble(study);
    const api = {
      submitDiagnostic: vi.fn().mockResolvedValue(snapshot('QUEUED', request)),
      getDiagnosticJob: vi.fn().mockResolvedValue({
        ...snapshot('FAILED', request), job_id: '00000000-0000-4000-8000-000000000499',
      }),
      getDiagnosticResult: vi.fn(),
    };

    await expect(executeStudyDiagnostic({
      authority, scenarioId: SCENARIO_ID, buildRequest: async () => request, api,
      nextId: idFactory(ATTEMPT_ID, RESERVATION_ID, TERMINAL_ID), now: () => NOW,
      waitForNextPoll: async () => undefined,
    })).rejects.toThrow('diverge');
    expect(authority.edits).toHaveLength(1);
  });
});

describe('cancel e retry diagnósticos', () => {
  it('só anexa terminal de cancelamento depois de observar CANCELLED', async () => {
    const { study, request } = await studyFixture();
    const preparingAuthority = new AuthorityDouble(study);
    let release!: (value: JobSnapshot) => void;
    const pending = new Promise<JobSnapshot>((resolve) => { release = resolve; });
    const preparingApi = {
      submitDiagnostic: vi.fn().mockResolvedValue(snapshot('QUEUED', request)),
      getDiagnosticJob: vi.fn().mockReturnValue(pending),
      getDiagnosticResult: vi.fn(),
    };
    const preparing = executeStudyDiagnostic({
      authority: preparingAuthority, scenarioId: SCENARIO_ID, buildRequest: async () => request,
      api: preparingApi, nextId: idFactory(ATTEMPT_ID, RESERVATION_ID), now: () => NOW,
      waitForNextPoll: async () => undefined,
    });
    await vi.waitFor(() => expect(preparingAuthority.edits).toHaveLength(1));
    const authority = new AuthorityDouble(preparingAuthority.edits[0]!);
    preparingAuthority.abort.abort();
    release(snapshot('RUNNING', request));
    await preparing;
    const api = {
      getDiagnosticJob: vi.fn().mockResolvedValue(snapshot('CANCELLED', request)),
      getDiagnosticResult: vi.fn(),
      cancelDiagnostic: vi.fn().mockResolvedValue(snapshot('CANCEL_REQUESTED', request)),
    };

    const result = await cancelStudyDiagnostic({
      authority, scenarioId: SCENARIO_ID, api,
      nextId: () => TERMINAL_ID, now: () => NOW, waitForNextPoll: async () => undefined,
    });

    expect(api.cancelDiagnostic).toHaveBeenCalledWith(JOB_ID, expect.any(AbortSignal));
    expect(result.status).toBe('CANCELLED');
    expect(authority.edits.at(-1)?.executions.at(-1)?.status).toBe('CANCELLED');
  });

  it('retry cria nova tentativa e preserva histórico terminal anterior', async () => {
    const { study, request } = await studyFixture();
    const authority = new AuthorityDouble(study);
    const firstApi = {
      submitDiagnostic: vi.fn().mockResolvedValue(snapshot('QUEUED', request)),
      getDiagnosticJob: vi.fn().mockResolvedValue(snapshot('FAILED', request)),
      getDiagnosticResult: vi.fn(),
    };
    await executeStudyDiagnostic({
      authority, scenarioId: SCENARIO_ID, buildRequest: async () => request, api: firstApi,
      nextId: idFactory(ATTEMPT_ID, RESERVATION_ID, TERMINAL_ID), now: () => NOW,
      waitForNextPoll: async () => undefined,
    });
    const retryJobId = '00000000-0000-4000-8000-000000000450';
    const retrySnapshot = { ...snapshot('FAILED', request), job_id: retryJobId, retry_of_job_id: JOB_ID };
    const retryDiagnostic = vi.fn().mockResolvedValue({ ...retrySnapshot, status: 'QUEUED' });

    await retryStudyDiagnostic({
      authority,
      executionId: TERMINAL_ID,
      idempotencyKey: retryJobId,
      api: {
        retryDiagnostic,
        getDiagnosticJob: vi.fn().mockResolvedValue(retrySnapshot),
        getDiagnosticResult: vi.fn(),
      },
      nextId: idFactory(
        '00000000-0000-4000-8000-000000000451',
        '00000000-0000-4000-8000-000000000452',
        '00000000-0000-4000-8000-000000000453',
      ),
      now: () => NOW,
      waitForNextPoll: async () => undefined,
    });

    const statuses = authority.snapshot.document?.executions.map((item) => item.status);
    expect(statuses).toEqual(['QUEUED', 'FAILED', 'QUEUED', 'FAILED']);
    const attempts = authority.snapshot.document?.executions
      .filter((item) => item.kind === 'DIAGNOSTIC').map((item) => item.attemptId);
    expect(new Set(attempts).size).toBe(2);
    expect(retryDiagnostic).toHaveBeenCalledWith(JOB_ID, retryJobId, expect.any(AbortSignal));
  });
});
