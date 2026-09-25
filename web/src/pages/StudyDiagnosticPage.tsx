import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import type { JobSnapshot } from '../api/client';
import { useDiagnosticRuntime } from '../app/providers';
import { useOptionalChat } from '../chat/ChatProvider';
import { selectionId } from '../chat/routeContext';
import type { FieldProvenance } from '../cases/domain';
import { buildDiagnosticRequest, DiagnosticRequestBuildError } from '../diagnostics/buildDiagnosticRequest';
import { DiagnosticControls } from '../diagnostics/components/DiagnosticControls';
import { DiagnosticEngineResult } from '../diagnostics/components/DiagnosticEngineResult';
import { DiagnosticStatus, type DiagnosticViewState } from '../diagnostics/components/DiagnosticStatus';
import {
  cancelStudyDiagnostic,
  executeStudyDiagnostic,
  retryStudyDiagnostic,
} from '../diagnostics/diagnosticExecutionService';
import { buildPreviewRequest, type PreviewRequestProvenance } from '../preparation/buildPreviewRequest';
import type { DiagnosticExecutionRecord, ScenarioDocument, StudyDocument } from '../study/model';

function requestProvenance(study: StudyDocument, scenario: ScenarioDocument): PreviewRequestProvenance {
  const fallback: FieldProvenance = {
    kind: 'SYNTHETIC_DEFAULT', source: 'configuração registrada no estudo', version: study.schemaVersion,
    recordedAt: study.createdAt, rule: 'study-defaults-v1',
  };
  return scenario.inputProvenance ?? {
    premises: { windowDays: fallback, costs: {
      iof_out: fallback, iof_in: fallback, carry_cnr: fallback, custo_fixo_remessa: fallback,
      custo_oportunidade_aa: fallback, spread_rail_bps: fallback, ptax: fallback,
    } }, period: { horizonDays: fallback },
  };
}

function transientState(snapshot: JobSnapshot): DiagnosticViewState {
  if (!['QUEUED', 'RUNNING', 'AGGREGATING', 'CANCEL_REQUESTED'].includes(snapshot.status)) {
    if (snapshot.status === 'SUCCEEDED') return { kind: 'SUCCEEDED', attemptId: snapshot.request_id };
    if (snapshot.status === 'CANCELLED') return { kind: 'CANCELLED', attemptId: snapshot.request_id };
    return { kind: 'FAILED', attemptId: snapshot.request_id, publicMessage: 'Não foi possível concluir o diagnóstico.' };
  }
  return {
    kind: snapshot.status as 'QUEUED' | 'RUNNING' | 'AGGREGATING' | 'CANCEL_REQUESTED',
    jobId: snapshot.job_id,
    progress: {
      completed: snapshot.progress.completed, failed: snapshot.progress.failed,
      total: snapshot.progress.total, phase: snapshot.progress.phase,
    },
  };
}

function persistedState(execution: DiagnosticExecutionRecord | null): DiagnosticViewState | null {
  if (execution === null) return null;
  if (execution.status === 'QUEUED') {
    return { kind: 'QUEUED', jobId: execution.jobId ?? execution.attemptId, progress: {
      completed: 0, failed: 0, total: execution.requestSnapshot.sampling.count, phase: 'QUEUED',
    } };
  }
  if (execution.status === 'FAILED') return {
    kind: 'FAILED', attemptId: execution.attemptId,
    publicMessage: 'Não foi possível concluir o diagnóstico. A tentativa anterior foi preservada no histórico.',
  };
  if (execution.status === 'CANCELLED') return { kind: 'CANCELLED', attemptId: execution.attemptId };
  if (execution.status === 'INTERRUPTED') return { kind: 'INTERRUPTED', attemptId: execution.attemptId };
  return { kind: 'SUCCEEDED', attemptId: execution.attemptId };
}

export function diagnosticsForScenario(
  study: StudyDocument,
  scenario: ScenarioDocument,
): readonly DiagnosticExecutionRecord[] {
  return study.executions.filter((item): item is DiagnosticExecutionRecord =>
    item.kind === 'DIAGNOSTIC' && item.scenarioId === scenario.id);
}

export function isCurrentForScenario(execution: DiagnosticExecutionRecord, scenario: ScenarioDocument): boolean {
  return execution.scenarioRevision === scenario.revision
    && execution.inputFingerprint === scenario.inputFingerprint;
}

export function latestDiagnostic(
  study: StudyDocument,
  scenario: ScenarioDocument,
): DiagnosticExecutionRecord | null {
  return [...diagnosticsForScenario(study, scenario)].reverse()[0] ?? null;
}

export function StudyDiagnosticPage() {
  const { studyId } = useParams();
  const [searchParams] = useSearchParams();
  const requestedScenarioId = searchParams.get('scenarioId');
  const rawExecutionId = searchParams.get('executionId');
  const requestedExecutionId = selectionId(rawExecutionId);
  const screenIdentity = `${studyId ?? ''}:${requestedScenarioId ?? ''}:${rawExecutionId ?? ''}`;
  const { controller, client } = useDiagnosticRuntime();
  const chat = useOptionalChat();
  const setChatScenarioId = chat?.setScenarioId;
  const setChatExecutionId = chat?.setDiagnosticExecutionId;
  const publishCommunication = chat?.publishCommunication;
  const heading = useRef<HTMLHeadingElement>(null);
  const resumedAttempts = useRef(new Set<string>());
  const mounted = useRef(true);
  const [study, setStudy] = useState<StudyDocument | null>(null);
  const [count, setCount] = useState<1 | 10 | 30 | 100>(10);
  const [viewState, setViewState] = useState<DiagnosticViewState | null>(null);
  const [runInProgress, setRunInProgress] = useState(false);
  const [cancelInFlight, setCancelInFlight] = useState(false);
  const cancelInFlightRef = useRef(false);
  const identityToken = useRef(0);
  const activeIdentity = useRef(screenIdentity);

  useEffect(() => {
    let active = true;
    const token = ++identityToken.current;
    activeIdentity.current = screenIdentity;
    mounted.current = true;
    resumedAttempts.current = new Set();
    setViewState(null);
    setRunInProgress(false);
    setCancelInFlight(false);
    heading.current?.focus();
    if (studyId === undefined) return () => { mounted.current = false; };
    void controller.loadStudy(studyId).then((loaded) => {
      if (!active || !mounted.current) return;
      if (token !== identityToken.current) return;
      setStudy(loaded);
      if (loaded === null) {
        setViewState({ kind: 'UNAVAILABLE', reason: 'O estudo não existe ou pertence a outra conta.' });
        return;
      }
      const selectedId = requestedScenarioId ?? loaded.baseScenarioId;
      const selected = loaded.scenarios.find((item) => item.id === selectedId);
      if (selected === undefined) setViewState({ kind: 'UNAVAILABLE', reason: 'O cenário solicitado não existe neste estudo.' });
      else if (rawExecutionId !== null) {
        const cited = selectionId(rawExecutionId) === null ? undefined : diagnosticsForScenario(loaded, selected).find((item) =>
          item.id === requestedExecutionId && item.status === 'SUCCEEDED' && item.envelope !== null
          && isCurrentForScenario(item, selected));
        setViewState(cited === undefined
          ? { kind: 'UNAVAILABLE', reason: 'A execução citada não está disponível neste Estudo.' }
          : persistedState(cited));
      } else setViewState(persistedState(latestDiagnostic(loaded, selected)));
    }).catch(() => {
      if (active && mounted.current) setViewState({ kind: 'UNAVAILABLE', reason: 'Não foi possível abrir o estudo.' });
    });
    const unsubscribe = controller.subscribe(() => {
      if (!mounted.current || token !== identityToken.current) return;
      const current = controller.snapshot.document;
      if (current?.id !== studyId) return;
      setStudy(current);
      if (controller.snapshot.status === 'STORAGE_FAILURE') {
        setViewState({ kind: 'STORAGE_FAILURE', message: 'O resultado não pôde ser salvo. Resolva o armazenamento antes de iniciar novo cálculo.' });
      }
    });
    return () => { active = false; mounted.current = false; unsubscribe(); };
  }, [controller, requestedScenarioId, requestedExecutionId, rawExecutionId, screenIdentity, studyId]);

  const selectedScenarioId = requestedScenarioId ?? study?.baseScenarioId;
  const scenario = study?.scenarios.find((item) => item.id === selectedScenarioId) ?? null;
  const generated = scenario?.sourceSnapshot.generationInputSnapshot !== undefined;
  const effectiveCount = generated ? count : 1;

  const trackedApi = useCallback(() => ({
    submitDiagnostic: async (...args: Parameters<typeof client.submitDiagnostic>) => {
      const result = await client.submitDiagnostic(...args); if (mounted.current && activeIdentity.current === screenIdentity) setViewState(transientState(result)); return result;
    },
    getDiagnosticJob: async (...args: Parameters<typeof client.getDiagnosticJob>) => {
      const result = await client.getDiagnosticJob(...args); if (mounted.current && activeIdentity.current === screenIdentity) setViewState(transientState(result)); return result;
    },
    getDiagnosticResult: client.getDiagnosticResult,
  }), [client, screenIdentity]);

  const complete = useCallback((attempt: Awaited<ReturnType<typeof executeStudyDiagnostic>>) => {
    if (!mounted.current || activeIdentity.current !== screenIdentity) return;
    const current = controller.snapshot.document;
    if (current !== null) setStudy(current);
    if (attempt.status === 'FAILED') setViewState({ kind: 'FAILED', attemptId: attempt.attemptId, publicMessage: 'Não foi possível concluir o diagnóstico. A tentativa anterior foi preservada no histórico.' });
    else setViewState({ kind: attempt.status, attemptId: attempt.attemptId });
  }, [controller, screenIdentity]);

  const run = useCallback(async () => {
    if (study === null || scenario === null || runInProgress) return;
    setRunInProgress(true);
    try {
      const result = await executeStudyDiagnostic({
        authority: controller,
        scenarioId: scenario.id,
        api: trackedApi(),
        buildRequest: async ({ study: currentStudy, scenario: currentScenario, attemptId }) => {
          const preview = await buildPreviewRequest(
            currentScenario.sourceSnapshot, currentScenario.premises, currentScenario.period,
            { requestId: crypto.randomUUID(), studyId: currentStudy.id, scenarioId: currentScenario.id, scenarioRevision: currentScenario.revision },
            requestProvenance(currentStudy, currentScenario),
          );
          return buildDiagnosticRequest({
            requestId: preview.request_id, idempotencyKey: crypto.randomUUID(), studyId: currentStudy.id,
            scenario: currentScenario, count: effectiveCount, baseSeed: attemptId, previewRequest: preview,
          });
        },
      });
      complete(result);
    } catch (reason) {
      const publicMessage = reason instanceof DiagnosticRequestBuildError
        ? `A entrada do diagnóstico é incompatível (${reason.code}).`
        : 'Não foi possível concluir o diagnóstico.';
      if (mounted.current) setViewState(controller.snapshot.status === 'STORAGE_FAILURE'
        ? { kind: 'STORAGE_FAILURE', message: 'O resultado não pôde ser salvo. Nenhum novo cálculo foi iniciado.' }
        : { kind: 'FAILED', attemptId: 'não persistida', publicMessage });
    } finally { if (mounted.current) setRunInProgress(false); }
  }, [complete, controller, effectiveCount, runInProgress, scenario, study, trackedApi]);

  useEffect(() => {
    if (study === null || scenario === null || runInProgress || rawExecutionId !== null) return;
    const latest = latestDiagnostic(study, scenario);
    if (latest?.status !== 'QUEUED' || resumedAttempts.current.has(latest.attemptId)) return;
    resumedAttempts.current.add(latest.attemptId);
    void run();
  }, [run, runInProgress, scenario, study, rawExecutionId]);

  const cancel = async () => {
    if (scenario === null || cancelInFlightRef.current) return;
    cancelInFlightRef.current = true;
    setCancelInFlight(true);
    try {
      const result = await cancelStudyDiagnostic({ authority: controller, scenarioId: scenario.id, api: {
        ...trackedApi(), cancelDiagnostic: client.cancelDiagnostic,
      } });
      complete(result);
    } finally {
      cancelInFlightRef.current = false;
      if (mounted.current) setCancelInFlight(false);
    }
  };

  const retry = async (attemptId: string) => {
    if (study === null || scenario === null || runInProgress || cancelInFlightRef.current) return;
    const terminal = [...diagnosticsForScenario(study, scenario)].reverse().find((item) => item.attemptId === attemptId);
    if (terminal === undefined) return;
    setRunInProgress(true);
    try {
      const result = await retryStudyDiagnostic({ authority: controller, executionId: terminal.id,
        idempotencyKey: crypto.randomUUID(), api: { ...trackedApi(), retryDiagnostic: client.retryDiagnostic } });
      complete(result);
    } catch {
      if (mounted.current) setViewState({ kind: 'FAILED', attemptId: 'não persistida', publicMessage: 'Não foi possível repetir o diagnóstico.' });
    } finally { if (mounted.current) setRunInProgress(false); }
  };

  const scenarioDiagnostics = study === null || scenario === null ? [] : diagnosticsForScenario(study, scenario);
  const terminal = scenario === null || (rawExecutionId !== null && requestedExecutionId === null) ? null
    : [...scenarioDiagnostics].reverse().find((item) =>
    item.status === 'SUCCEEDED' && item.envelope !== null && isCurrentForScenario(item, scenario)
      && (requestedExecutionId === null || item.id === requestedExecutionId)) ?? null;
  const envelope = terminal?.envelope ?? null;
  const chatScenarioId = study?.id === studyId ? scenario?.id ?? null : null;
  const chatExecutionId = study?.id === studyId ? terminal?.id ?? null : null;
  useEffect(() => { setChatScenarioId?.(chatScenarioId); }, [setChatScenarioId, chatScenarioId]);
  useEffect(() => { setChatExecutionId?.(chatExecutionId); }, [setChatExecutionId, chatExecutionId]);
  useEffect(() => {
    publishCommunication?.(study !== null && scenario !== null && terminal !== null
      ? { study, scenarioId: scenario.id, diagnosticExecutionId: terminal.id,
        comparisonExecutionId: null, replay: null, replayDay: null } : null);
  }, [publishCommunication, study, scenario, terminal]);
  return <article className="diagnostic-page">
    <p className="eyebrow">Estudo {study?.name ?? ''}</p>
    <h1 ref={heading} tabIndex={-1}>Diagnóstico robusto</h1>
    <p className="page-introduction">Múltiplas repetições quando a origem é gerável; uma execução individual quando a entrada já está fixa.</p>
    {study === null || scenario === null ? <DiagnosticStatus state={viewState ?? { kind: 'UNAVAILABLE', reason: 'Carregando estudo…' }} /> : <>
      <DiagnosticControls generated={generated} count={effectiveCount} onCountChange={setCount} onRun={() => void run()} disabled={runInProgress || controller.snapshot.status === 'STORAGE_FAILURE'} />
      {viewState === null || viewState.kind === 'SUCCEEDED' ? null : <DiagnosticStatus state={viewState} {...(cancelInFlight ? {} : { onCancel: () => void cancel() })} onRetry={(attemptId) => void retry(attemptId)} />}
      {envelope === null ? null : <>
        <Link className="button-link replay-cta" to={`/estudos/${study.id}/replay?executionId=${encodeURIComponent(terminal!.id)}`}>Abrir Replay · Fronteira Viva</Link>
        <DiagnosticEngineResult envelope={envelope} />
      </>}
    </>}
  </article>;
}

