// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiagnosticEnvelope, DiagnosticRequest, JobSnapshot } from '../api/client';
import { validateDiagnosticEnvelope } from '../api/validators';
import { makePortfolioStudy } from '../performance/portfolioPerformanceFixtures';
import { prepareCombinationStudy } from '../levers/prepareCombinationStudy';
import { currentDiagnostic } from '../levers/savingsOrigin';
import { IndexedDbApplicationRepository } from '../storage/indexedDbApplicationRepository';
import { RevisionConflictError } from '../storage/errors';
import { renameStudy, updateScenario } from '../study/domain';
import { StudyController } from '../study/studyController';
import type { DeepMutable, DiagnosticExecutionRecord, StudyDocument } from '../study/model';
import { StudyDiagnosticPage } from './StudyDiagnosticPage';

const runtime = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../app/providers', () => ({ useDiagnosticRuntime: () => runtime.current }));
vi.mock('../chat/ChatProvider', () => ({ useOptionalChat: () => null }));

const fixtures = new Map<number, Promise<{ study: StudyDocument; templates: DiagnosticExecutionRecord[] }>>();
async function comboStudy(count = 3) {
  const companies = count === 255 ? 8 : 6;
  if (!fixtures.has(companies)) fixtures.set(companies, (async () => {
    const full = await makePortfolioStudy(companies);
    const study = await prepareCombinationStudy({ ...full, scenarios: [full.scenarios[0]!], executions: [] }, () => {});
    return { study, templates: full.executions.filter((item): item is DiagnosticExecutionRecord =>
      item.kind === 'DIAGNOSTIC' && item.status === 'SUCCEEDED') };
  })());
  const fixture = structuredClone(await fixtures.get(companies)!);
  return { ...fixture, study: { ...fixture.study, scenarios: fixture.study.scenarios.slice(0, count) } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

function terminalPublished(controller: StudyController, scenarioId: string): Promise<void> {
  const ready = deferred<void>();
  const unsubscribe = controller.subscribe(() => {
    if (controller.snapshot.status === 'SAVED' && controller.snapshot.document?.executions.some((execution) =>
      execution.scenarioId === scenarioId && execution.status === 'SUCCEEDED')) {
      unsubscribe();
      ready.resolve();
    }
  });
  return ready.promise;
}

const controllers: StudyController[] = [];
let prepared255: Awaited<ReturnType<typeof initializeStudy>>;
beforeAll(async () => {
  await Promise.all([comboStudy(255), comboStudy(3)]);
  prepared255 = await initializeStudy(255);
});
afterEach(() => { cleanup(); controllers.splice(0).forEach((controller) => controller.close()); vi.restoreAllMocks(); });

async function initializeStudy(count: number) {
  const { study, templates } = await comboStudy(count);
  const repository = new IndexedDbApplicationRepository({ projectRef: crypto.randomUUID(), ownerSub: study.ownerSub });
  const channelScope = crypto.randomUUID();
  const controller = new StudyController({ repositoryFactory: () => repository, channelScope });
  await controller.switchSession(study.ownerSub);
  await repository.saveStudy({ document: { ...study, revision: 1 }, expectedRevision: 0, operationId: crypto.randomUUID() });
  controllers.push(controller);
  return { study, templates, repository, controller, channelScope };
}

async function openStudy(count = 3, query = '') {
  const { study, templates, repository, controller, channelScope } = count === 255 ? prepared255 : await initializeStudy(count);
  const jobs: { request: DiagnosticRequest; signal: AbortSignal; done: ReturnType<typeof deferred<JobSnapshot>> }[] = [];
  const snapshot = (request: DiagnosticRequest, status: JobSnapshot['status']): JobSnapshot => ({
    api_version: '1.0.0', job_id: request.idempotency_key, request_id: request.request_id, status,
    progress: { completed: status === 'SUCCEEDED' ? 1 : 0, failed: status === 'FAILED' ? 1 : 0,
      total: 1, current_repetition_id: null, phase: status === 'QUEUED' ? 'QUEUED' : 'TERMINAL',
      created_at: study.createdAt, started_at: study.createdAt, updated_at: study.createdAt,
      finished_at: status === 'QUEUED' ? null : study.createdAt }, retry_of_job_id: null,
    error: status === 'FAILED' ? { code: 'DIAGNOSTICO_INVALIDO', message: 'Falha controlada.', repetition_id: null } : null,
  });
  const client = {
    submitDiagnostic: vi.fn(async (request: DiagnosticRequest, signal: AbortSignal) => {
      jobs.push({ request, signal, done: deferred<JobSnapshot>() });
      return snapshot(request, 'QUEUED');
    }),
    getDiagnosticJob: vi.fn(async (id: string, signal: AbortSignal) => {
      const job = jobs.find((item) => item.request.idempotency_key === id)!;
      return new Promise<JobSnapshot>((resolve, reject) => {
        const abort = () => reject(new DOMException('Abortado', 'AbortError'));
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        void job.done.promise.then((value) => { signal.removeEventListener('abort', abort); resolve(value); });
      });
    }),
    getDiagnosticResult: vi.fn(async (id: string): Promise<DiagnosticEnvelope> => {
      const { request } = jobs.find((item) => item.request.idempotency_key === id)!;
      if (request.sampling.kind !== 'FIXED_INPUT') throw new Error('Lote deve ter entrada fixa.');
      const ids = request.sampling.preview_request.cenario.ordens.map((order) => order.id).sort().join(',');
      const template = templates.find((item) => item.sourceSnapshot.orders.map((order) => order.id).sort().join(',') === ids)!;
      const envelope = structuredClone(template.envelope) as DiagnosticEnvelope;
      envelope.job_id = id;
      envelope.request_fingerprint = request.input_fingerprint;
      envelope.selected_execution.study_id = request.study_id;
      envelope.selected_execution.scenario_id = request.scenario_id;
      envelope.selected_execution.scenario_revision = request.scenario_revision;
      envelope.selected_execution.request_id = request.request_id;
      envelope.selected_execution.input_snapshot.cenario = structuredClone(request.sampling.preview_request.cenario);
      if (!validateDiagnosticEnvelope(envelope)) throw new Error(JSON.stringify(validateDiagnosticEnvelope.errors));
      return envelope;
    }),
  };
  runtime.current = { controller, client };
  const router = createMemoryRouter([
    { path: '/estudos/:studyId/diagnostico', element: <StudyDiagnosticPage /> },
    { path: '/elsewhere', element: <p>Outra página</p> },
  ], { initialEntries: [`/estudos/${study.id}/diagnostico${query}`] });
  const loaded = deferred<void>();
  const unsubscribe = controller.subscribe(() => {
    if (controller.snapshot.document?.id === study.id) loaded.resolve();
  });
  render(<RouterProvider router={router} />);
  await act(async () => loaded.promise);
  unsubscribe();
  expect(screen.getByRole('button', { name: 'Diagnosticar combinações' })).toBeInTheDocument();
  const finish = async (scenarioId: string, status: JobSnapshot['status'] = 'SUCCEEDED') => {
    const job = [...jobs].reverse().find((item) => item.request.scenario_id === scenarioId);
    if (job === undefined) throw new Error(`Nenhum job enviado para ${scenarioId}.`);
    await act(async () => job.done.resolve(snapshot(job.request, status)));
  };
  return { study, repository, controller, client, jobs, router, finish, channelScope };
}

async function start() { await userEvent.click(screen.getByRole('button', { name: 'Diagnosticar combinações' })); }
async function idle() { await waitFor(() => expect(screen.getByRole('button', { name: 'Diagnosticar combinações' })).toBeEnabled()); }

describe('combination study diagnosis', () => {
  describe('255-composition fixture', () => {
    let opened: Awaited<ReturnType<typeof openStudy>>;
    beforeEach(async () => { opened = await openStudy(255); });
    it('shows compact progress for 255 compositions, drains cancelled actives and restores the latest recommendation', async () => {
      const { study, jobs, controller, finish } = opened;
      expect(screen.getByText('Comparáveis atuais')).toBeInTheDocument();
      await start();
      await waitFor(() => expect(jobs).toHaveLength(2));
      expect(screen.getByText(/0 de 255 concluídas/)).toHaveAttribute('role', 'status');
      expect(screen.getByText(/recomendação será atualizada após o lote/)).toBeInTheDocument();
      expect(screen.queryByText('Comparáveis atuais')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar lote' }));
      expect(jobs.every((job) => !job.signal.aborted)).toBe(true);
      const firstSaved = terminalPublished(controller, study.scenarios[1]!.id);
      await finish(study.scenarios[1]!.id);
      await act(async () => firstSaved);
      expect(screen.queryByText('Comparáveis atuais')).not.toBeInTheDocument();
      const lastSaved = terminalPublished(controller, study.baseScenarioId);
      await finish(study.baseScenarioId);
      await act(async () => lastSaved);
      await idle();
      expect(jobs).toHaveLength(2);
      expect(controller.snapshot.document!.executions).toHaveLength(4);
      expect(screen.getByText('Comparáveis atuais').parentElement).toHaveTextContent('2');
      expect(screen.queryByText(/recomendação será atualizada após o lote/)).not.toBeInTheDocument();
    });
  });

  it('has no incidental submissions or individual controls on the overview', async () => {
    const { jobs } = await openStudy();
    expect(screen.getByRole('heading', { name: 'Qual carteira atende melhor?' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Executar diagnóstico' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Original × variações' })).not.toBeInTheDocument();
    expect(jobs).toHaveLength(0);
  });

  it('submits two simultaneous jobs and serially appends terminals finishing out of order', async () => {
    const { study, jobs, controller, repository, finish } = await openStudy();
    const append = repository.appendDiagnosticAttempt.bind(repository);
    const gate = deferred<void>();
    let active = 0;
    let peak = 0;
    const commits: string[] = [];
    vi.spyOn(repository, 'appendDiagnosticAttempt').mockImplementation(async (input) => {
      peak = Math.max(peak, ++active); commits.push(input.reservation.scenarioId);
      if (commits.length === 1) await gate.promise;
      try { return await append(input); } finally { active--; }
    });
    await start();
    await waitFor(() => expect(jobs).toHaveLength(2));
    await finish(study.scenarios[1]!.id);
    await waitFor(() => expect(commits).toHaveLength(1));
    await finish(study.baseScenarioId);
    expect(commits).toEqual([study.scenarios[1]!.id]);
    await act(async () => gate.resolve());
    await waitFor(() => expect(jobs).toHaveLength(3));
    await finish(study.scenarios[2]!.id);
    await idle();
    expect(peak).toBe(1);
    expect(commits).toEqual([study.scenarios[1]!.id, study.baseScenarioId, study.scenarios[2]!.id]);
    expect(controller.snapshot.document!.executions).toHaveLength(6);
    expect(jobs.every((job) => job.request.sampling.kind === 'FIXED_INPUT' && job.request.sampling.count === 1)).toBe(true);
    await start(); await idle();
    expect(jobs).toHaveLength(3);
    expect(screen.getByText('Comparáveis atuais').parentElement).toHaveTextContent('3');
  });

  it('recovers once from a real broadcast during a saved append and commits all three computes without duplicates', async () => {
    const { study, jobs, controller, repository, finish, channelScope, client } = await openStudy();
    const externalChannel = new BroadcastChannel(`motor-fluxo:study:v2:${encodeURIComponent(channelScope)}:${encodeURIComponent(study.ownerSub)}`);
    const append = repository.appendDiagnosticAttempt.bind(repository);
    const load = vi.spyOn(controller, 'loadStudy');
    const commits: string[] = [];
    const statuses: string[] = [];
    const unsubscribe = controller.subscribe(() => statuses.push(controller.snapshot.status));
    vi.spyOn(repository, 'appendDiagnosticAttempt').mockImplementation(async (input) => {
      commits.push(input.reservation.scenarioId);
      const delta = await append(input);
      if (commits.length === 1) {
        // Another tab writes after our transaction, before its delta reaches the controller.
        const saved = (await repository.getStudy(study.id))!;
        const renamed = await renameStudy(saved, 'Outra aba durante append', saved.updatedAt);
        await repository.saveStudy({ document: renamed, expectedRevision: saved.revision, operationId: crypto.randomUUID() });
        const conflicted = deferred<void>();
        const stop = controller.subscribe(() => {
          if (controller.snapshot.status === 'CONFLICT') { stop(); conflicted.resolve(); }
        });
        externalChannel.postMessage({ studyId: study.id, revision: renamed.revision, operationId: 'external-rename' });
        await conflicted.promise;
      }
      return delta;
    });
    try {
      await start(); await waitFor(() => expect(jobs).toHaveLength(2));
      await finish(study.scenarios[1]!.id);
      // A is still active. C can only start after B's commit/recovery releases its slot.
      await waitFor(() => expect(jobs).toHaveLength(3));
      expect(load).toHaveBeenCalledExactlyOnceWith(study.id);
      expect(controller.snapshot.status).toBe('SAVED');
      await finish(study.baseScenarioId);
      await finish(study.scenarios[2]!.id);
      await idle();
      const stored = (await repository.getStudy(study.id))!;
      expect(load).toHaveBeenCalledTimes(1);
      expect(commits).toHaveLength(3);
      expect(new Set(commits)).toEqual(new Set(study.scenarios.map((scenario) => scenario.id)));
      expect(client.submitDiagnostic).toHaveBeenCalledTimes(3);
      expect(new Set(jobs.map((job) => job.request.scenario_id))).toEqual(new Set(commits));
      expect(stored).toMatchObject({ name: 'Outra aba durante append', revision: 5 });
      expect(stored.executions).toHaveLength(6);
      for (const scenario of stored.scenarios) expect(currentDiagnostic(stored, scenario)?.status).toBe('SUCCEEDED');
      expect(controller.snapshot).toMatchObject({ status: 'SAVED', error: null, document: stored });
      expect(statuses).toContain('CONFLICT');
      expect(statuses).not.toContain('STORAGE_FAILURE');
      expect(screen.queryByText(/Carregue um estudo salvo e certificado/)).not.toBeInTheDocument();
    } finally { unsubscribe(); externalChannel.close(); }
  });

  it('consumes runAll once and does not repeat completed scenarios after rerenders', async () => {
    const { study, jobs, router, controller, finish } = await openStudy(2, '?runAll=1');
    await waitFor(() => expect(jobs).toHaveLength(2));
    await finish(study.baseScenarioId); await finish(study.scenarios[1]!.id); await idle();
    expect(router.state.location.search).toBe('');
    await act(async () => { await controller.loadStudy(controller.snapshot.document!.id); });
    expect(jobs).toHaveLength(2);
  });

  it('drains and saves both active terminals after failure, then reruns only pending scenarios', async () => {
    const { study, jobs, controller, finish } = await openStudy();
    await start(); await waitFor(() => expect(jobs).toHaveLength(2));
    await finish(study.scenarios[1]!.id, 'FAILED');
    await waitFor(() => expect(controller.snapshot.document!.executions).toHaveLength(2));
    expect(screen.queryByText('Comparáveis atuais')).not.toBeInTheDocument();
    await finish(study.baseScenarioId); await idle();
    expect(jobs).toHaveLength(2);
    expect(controller.snapshot.document!.executions.map((item) => item.status)).toEqual(['QUEUED', 'FAILED', 'QUEUED', 'SUCCEEDED']);
    expect(screen.getByText('Comparáveis atuais').parentElement).toHaveTextContent('1');
    await start(); await waitFor(() => expect(jobs).toHaveLength(4));
    expect(jobs.slice(2).map((job) => job.request.scenario_id)).not.toContain(study.baseScenarioId);
    await finish(study.scenarios[1]!.id); await finish(study.scenarios[2]!.id); await idle();
  });

  it.each(['navigation', 'session'] as const)('aborts active polling on %s and never commits a late terminal', async (kind) => {
    const { study, jobs, router, controller, repository, finish } = await openStudy();
    const append = vi.spyOn(repository, 'appendDiagnosticAttempt');
    await start(); await waitFor(() => expect(jobs).toHaveLength(2));
    await act(async () => { if (kind === 'navigation') await router.navigate('/elsewhere'); else await controller.switchSession(null); });
    expect(jobs.every((job) => job.signal.aborted)).toBe(true);
    await finish(study.baseScenarioId); await finish(study.scenarios[1]!.id);
    expect(append).not.toHaveBeenCalled();
    expect(jobs).toHaveLength(2);
  });

  it.each(['unchanged', 'already committed', 'changed scenario', 'second conflict'] as const)(
    'reloads the same study once after conflict: %s', async (mode) => {
      const { study, jobs, repository, controller, finish } = await openStudy(1);
      const append = repository.appendDiagnosticAttempt.bind(repository);
      let calls = 0;
      vi.spyOn(repository, 'appendDiagnosticAttempt').mockImplementation(async (input) => {
        calls++;
        if (calls === 1) {
          if (mode === 'already committed') await append(input);
          else {
            const saved = (await repository.getStudy(input.studyId))!;
            const next = mode === 'changed scenario'
              ? await updateScenario(saved, input.reservation.scenarioId, { premises: { ...saved.scenarios[0]!.premises, windowDays: 2 } }, new Date().toISOString())
              : await renameStudy(saved, 'Renomeado em outra aba', new Date().toISOString());
            await repository.saveStudy({ document: next, expectedRevision: saved.revision, operationId: crypto.randomUUID() });
          }
          throw new RevisionConflictError(input.expectedRevision, input.expectedRevision + 1);
        }
        if (mode === 'second conflict') throw new RevisionConflictError(input.expectedRevision, input.expectedRevision + 1);
        return append(input);
      });
      const load = vi.spyOn(controller, 'loadStudy');
      await start(); await waitFor(() => expect(jobs).toHaveLength(1)); await finish(study.baseScenarioId); await idle();
      expect(load).toHaveBeenCalledExactlyOnceWith(controller.snapshot.document!.id);
      expect(calls).toBe(mode === 'already committed' || mode === 'changed scenario' ? 1 : 2);
      const saved = (await repository.getStudy(controller.snapshot.document!.id))!;
      expect(saved.executions).toHaveLength(mode === 'changed scenario' || mode === 'second conflict' ? 0 : 2);
    },
  );

  it.each(['completed elsewhere', 'changed revision', 'changed composition'] as const)(
    'revalidates queued C after conflict reload brings C %s without submitting it', async (mode) => {
      const { study, jobs, repository, controller, client, finish } = await openStudy(3);
      // Deliberately deliver the base POST second: arrival order is not scenario identity.
      const submit = client.submitDiagnostic.getMockImplementation()!;
      const otherSubmitted = deferred<void>();
      client.submitDiagnostic.mockImplementation(async (request, signal) => {
        if (request.scenario_id === study.baseScenarioId) await otherSubmitted.promise;
        const response = await submit(request, signal);
        if (request.scenario_id !== study.baseScenarioId) otherSubmitted.resolve();
        return response;
      });
      const queued = study.scenarios[2]!;
      const append = repository.appendDiagnosticAttempt.bind(repository);
      const external = (await comboStudy()).templates.find((item) =>
        item.sourceSnapshot.orders.map((order) => order.id).sort().join(',')
        === queued.sourceSnapshot.orders.map((order) => order.id).sort().join(','))!;
      const terminal = structuredClone(external) as DeepMutable<DiagnosticExecutionRecord>;
      terminal.scenarioId = queued.id;
      terminal.scenarioRevision = queued.revision;
      terminal.inputFingerprint = queued.inputFingerprint;
      terminal.sourceSnapshot = structuredClone(queued.sourceSnapshot) as DeepMutable<typeof queued.sourceSnapshot>;
      terminal.periodSnapshot = structuredClone(queued.period);
      terminal.premisesSnapshot = structuredClone(queued.premises) as DeepMutable<typeof queued.premises>;
      terminal.requestSnapshot.scenario_id = queued.id;
      terminal.requestSnapshot.scenario_revision = queued.revision;
      terminal.requestSnapshot.input_fingerprint = queued.inputFingerprint;
      if (terminal.requestSnapshot.sampling.kind !== 'FIXED_INPUT') throw new Error('Entrada fixa esperada.');
      terminal.requestSnapshot.sampling.preview_request.scenario_id = queued.id;
      terminal.envelope!.request_fingerprint = queued.inputFingerprint;
      terminal.envelope!.selected_execution.scenario_id = queued.id;
      terminal.envelope!.selected_execution.scenario_revision = queued.revision;
      const reservation: DiagnosticExecutionRecord = { ...terminal, id: crypto.randomUUID(),
        status: 'QUEUED', envelope: null, finishedAt: null };
      let injected = false;
      const localCommits: string[] = [];
      vi.spyOn(repository, 'appendDiagnosticAttempt').mockImplementation(async (input) => {
        localCommits.push(input.reservation.scenarioId);
        if (!injected) {
          injected = true;
          if (mode === 'completed elsewhere') await append({ ...input, operationId: crypto.randomUUID(), reservation, terminal });
          else {
            const saved = (await repository.getStudy(study.id))!;
            const changedId = mode === 'changed revision' ? queued.id : saved.baseScenarioId;
            const scenario = saved.scenarios.find((item) => item.id === changedId)!;
            const next = await updateScenario(saved, changedId,
              { premises: { ...scenario.premises, windowDays: scenario.premises.windowDays + 1 } }, new Date().toISOString());
            await repository.saveStudy({ document: next, expectedRevision: saved.revision, operationId: crypto.randomUUID() });
          }
          throw new RevisionConflictError(input.expectedRevision, input.expectedRevision + 1);
        }
        return append(input);
      });
      const load = vi.spyOn(controller, 'loadStudy');
      await start(); await waitFor(() => expect(jobs).toHaveLength(2));
      // B triggers reload; A remains active so the skipped count is observable.
      await finish(study.scenarios[1]!.id);
      await waitFor(() => expect(localCommits).toHaveLength(2));
      expect(load).toHaveBeenCalledExactlyOnceWith(study.id);
      expect(jobs.map((job) => job.request.scenario_id)).not.toContain(queued.id);
      expect(await screen.findByText(/1 de 3 concluídas.*1 ignoradas/)).toHaveAttribute('role', 'status');
      await finish(study.baseScenarioId);
      if (mode === 'changed composition') await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancelar lote' })).not.toBeInTheDocument());
      else await idle();
      expect(jobs).toHaveLength(2);
      expect(localCommits).not.toContain(queued.id);
      const stored = (await repository.getStudy(study.id))!;
      if (mode === 'completed elsewhere') {
        expect(currentDiagnostic(stored, queued)).toEqual(terminal);
        expect(stored.executions).toHaveLength(6);
      } else expect(stored.executions.some((execution) => execution.scenarioId === queued.id)).toBe(false);
    },
  );

  it('opens one persisted execution with a return link and no recursive recommendation', async () => {
    const { jobs, controller, router, finish } = await openStudy(1);
    await start(); await waitFor(() => expect(jobs).toHaveLength(1)); await finish(controller.snapshot.document!.baseScenarioId); await idle();
    const study = controller.snapshot.document!;
    expect(currentDiagnostic(study, study.scenarios[0]!)).not.toBeNull();
    await act(async () => { await router.navigate(`/estudos/${study.id}/diagnostico?scenarioId=${study.baseScenarioId}`); });
    expect(await screen.findByRole('link', { name: 'Voltar à recomendação' }))
      .toHaveAttribute('href', `/estudos/${study.id}/diagnostico`);
    expect(screen.getByRole('region', { name: 'Resultado do motor' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Custos por componente/ }));
    expect(screen.getByRole('region', { name: 'Tabela de decomposição de custos' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Qual carteira atende melhor?' })).not.toBeInTheDocument();
  });
});
