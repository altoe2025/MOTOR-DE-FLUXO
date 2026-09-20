"""Coordenador em memória para diagnósticos limitados e isolados por owner."""

from __future__ import annotations

import hashlib
import json
import multiprocessing
from collections import deque
from collections.abc import Callable
from concurrent.futures import Future, ProcessPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from threading import Condition, Lock, Thread
from typing import Literal, Protocol, cast
from uuid import UUID

from servidor.contracts.diagnostics import (
    DiagnosticEnvelope,
    DiagnosticRequest,
    GeneratedInputPlan,
    JobError,
    JobProgress,
    JobSnapshot,
    JobStatus,
)
from servidor.diagnostics.service import (
    RepetitionResult,
    RepetitionTask,
    aggregate_diagnostic,
    execute_repetition,
)

_ACTIVE = {"QUEUED", "RUNNING", "AGGREGATING", "CANCEL_REQUESTED"}
CommandKind = Literal["SUBMIT", "RETRY"]
JobKey = tuple[str, UUID]
MaintenanceWaiter = Callable[[Condition, float | None], None]


class DiagnosticExecutorError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class WorkerPool(Protocol):
    def submit(self, task: RepetitionTask) -> Future[object]: ...

    def shutdown(self, *, wait: bool, cancel_futures: bool) -> None: ...


class _ProcessWorkerPool:
    def __init__(self, max_workers: int) -> None:
        self._executor = ProcessPoolExecutor(
            max_workers=max_workers,
            mp_context=multiprocessing.get_context("spawn"),
        )

    def submit(self, task: RepetitionTask) -> Future[object]:
        return cast(Future[object], self._executor.submit(execute_repetition, task))

    def shutdown(self, *, wait: bool, cancel_futures: bool) -> None:
        self._executor.shutdown(wait=wait, cancel_futures=cancel_futures)


@dataclass
class _Job:
    owner_sub: str
    job_id: UUID
    request: DiagnosticRequest
    retry_of_job_id: UUID | None
    status: JobStatus
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    completed: int = 0
    failed: int = 0
    current_repetition_id: UUID | None = None
    results: list[RepetitionResult] = field(default_factory=list)
    envelope: DiagnosticEnvelope | None = None
    error: JobError | None = None

    @property
    def total(self) -> int:
        return self.request.sampling.count


@dataclass(frozen=True)
class _IdempotencyBinding:
    command_kind: CommandKind
    command_identity: str
    declared_fingerprint: str
    retry_of_job_id: UUID | None
    job_id: UUID


def _canonical_command_identity(request: DiagnosticRequest) -> str:
    """Hash de todo o comando, exceto a chave que seleciona este binding."""
    document = request.model_dump(mode="json", exclude={"idempotency_key"})
    encoded = json.dumps(
        document,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _condition_wait(condition: Condition, timeout: float | None) -> None:
    condition.wait(timeout)


class DiagnosticExecutor:
    def __init__(
        self,
        *,
        build_sha: str,
        worker_pool: WorkerPool | None = None,
        relogio: Callable[[], datetime] | None = None,
        maintenance_waiter: MaintenanceWaiter | None = None,
        max_workers: int = 2,
        max_jobs_per_owner: int = 3,
        max_jobs_global: int = 32,
        retention_seconds: int = 86400,
    ) -> None:
        if not 1 <= max_workers <= 4:
            raise ValueError("max_workers deve estar entre 1 e 4")
        if max_jobs_per_owner < 1 or max_jobs_global < 1 or retention_seconds < 1:
            raise ValueError("limites do executor devem ser positivos")
        self._build_sha = build_sha
        self._clock = relogio or (lambda: datetime.now(UTC))
        self._maintenance_waiter = maintenance_waiter or _condition_wait
        self._max_workers = max_workers
        self._max_jobs_per_owner = max_jobs_per_owner
        self._max_jobs_global = max_jobs_global
        self._retention = timedelta(seconds=retention_seconds)
        self._pool = worker_pool or _ProcessWorkerPool(max_workers)
        self._lock = Lock()
        self._condition = Condition(self._lock)
        self._jobs: dict[JobKey, _Job] = {}
        self._idempotency: dict[tuple[str, UUID], _IdempotencyBinding] = {}
        self._queue: deque[JobKey] = deque()
        self._running = 0
        self._closed = False
        self._dispatcher = Thread(
            target=self._dispatch_loop,
            name="diagnostic-dispatcher",
            daemon=True,
        )
        self._dispatcher.start()

    def _clock_value(self) -> datetime:
        value = self._clock()
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("relógio do executor deve conter fuso")
        return value

    def _now_for(self, job: _Job) -> datetime:
        return max(self._clock_value(), job.updated_at)

    def _expire_locked(self) -> None:
        now = self._clock_value()
        expired = {
            job_key
            for job_key, job in self._jobs.items()
            if job.status not in _ACTIVE
            and job.finished_at is not None
            and now - job.finished_at >= self._retention
        }
        for job_key in expired:
            del self._jobs[job_key]
        if expired:
            self._idempotency = {
                key: binding
                for key, binding in self._idempotency.items()
                if (key[0], binding.job_id) not in expired
            }

    def _next_expiry_timeout_locked(self) -> float | None:
        deadlines = [
            job.finished_at + self._retention
            for job in self._jobs.values()
            if job.status not in _ACTIVE and job.finished_at is not None
        ]
        if not deadlines:
            return None
        return max(0.0, (min(deadlines) - self._clock_value()).total_seconds())

    def _snapshot(self, job: _Job) -> JobSnapshot:
        phase = cast(
            Literal["QUEUED", "EXECUTING", "AGGREGATING", "TERMINAL"],
            {
                "QUEUED": "QUEUED",
                "RUNNING": "EXECUTING",
                "AGGREGATING": "AGGREGATING",
                "CANCEL_REQUESTED": (
                    "EXECUTING" if job.started_at is not None else "QUEUED"
                ),
                "SUCCEEDED": "TERMINAL",
                "FAILED": "TERMINAL",
                "CANCELLED": "TERMINAL",
            }[job.status],
        )
        return JobSnapshot(
            api_version="1.0.0",
            job_id=job.job_id,
            request_id=job.request.request_id,
            status=job.status,
            progress=JobProgress(
                completed=job.completed,
                failed=job.failed,
                total=job.total,
                current_repetition_id=job.current_repetition_id,
                phase=phase,
                created_at=job.created_at,
                started_at=job.started_at,
                updated_at=job.updated_at,
                finished_at=job.finished_at,
            ),
            retry_of_job_id=job.retry_of_job_id,
            error=job.error,
        )

    def _owned_locked(self, owner_sub: str, job_id: UUID) -> _Job:
        job = self._jobs.get((owner_sub, job_id))
        if job is None:
            raise DiagnosticExecutorError("JOB_NAO_ENCONTRADO")
        return job

    def _submit_locked(
        self,
        owner_sub: str,
        request: DiagnosticRequest,
        command_kind: CommandKind,
        retry_of_job_id: UUID | None,
    ) -> JobSnapshot:
        if self._closed:
            raise DiagnosticExecutorError("EXECUTOR_FECHADO")
        key = (owner_sub, request.idempotency_key)
        identity = _canonical_command_identity(request)
        binding = self._idempotency.get(key)
        if binding is not None:
            if (
                binding.command_kind != command_kind
                or binding.command_identity != identity
                or binding.declared_fingerprint != request.input_fingerprint
                or binding.retry_of_job_id != retry_of_job_id
            ):
                raise DiagnosticExecutorError("IDEMPOTENCIA_CONFLITANTE")
            job = self._jobs.get((owner_sub, binding.job_id))
            if job is not None:
                return self._snapshot(job)
            del self._idempotency[key]
        active = [job for job in self._jobs.values() if job.status in _ACTIVE]
        if (
            len(active) >= self._max_jobs_global
            or sum(job.owner_sub == owner_sub for job in active)
            >= self._max_jobs_per_owner
        ):
            raise DiagnosticExecutorError("FILA_CHEIA")
        now = self._clock_value()
        job = _Job(
            owner_sub=owner_sub,
            job_id=request.idempotency_key,
            request=request,
            retry_of_job_id=retry_of_job_id,
            status="QUEUED",
            created_at=now,
            updated_at=now,
        )
        job_key = (owner_sub, job.job_id)
        self._jobs[job_key] = job
        self._idempotency[key] = _IdempotencyBinding(
            command_kind=command_kind,
            command_identity=identity,
            declared_fingerprint=request.input_fingerprint,
            retry_of_job_id=retry_of_job_id,
            job_id=job.job_id,
        )
        self._queue.append(job_key)
        snapshot = self._snapshot(job)
        self._condition.notify_all()
        return snapshot

    def submit(self, owner_sub: str, request: DiagnosticRequest) -> JobSnapshot:
        with self._condition:
            self._expire_locked()
            return self._submit_locked(owner_sub, request, "SUBMIT", None)

    def get(self, owner_sub: str, job_id: UUID) -> JobSnapshot:
        with self._lock:
            self._expire_locked()
            return self._snapshot(self._owned_locked(owner_sub, job_id))

    def result(self, owner_sub: str, job_id: UUID) -> DiagnosticEnvelope:
        with self._lock:
            self._expire_locked()
            job = self._owned_locked(owner_sub, job_id)
            if job.status != "SUCCEEDED" or job.envelope is None:
                raise DiagnosticExecutorError("JOB_NAO_TERMINAL")
            return job.envelope

    def cancel(self, owner_sub: str, job_id: UUID) -> JobSnapshot:
        with self._condition:
            self._expire_locked()
            job = self._owned_locked(owner_sub, job_id)
            if job.status == "CANCELLED":
                return self._snapshot(job)
            if job.status in {"SUCCEEDED", "FAILED"}:
                raise DiagnosticExecutorError("CANCELAMENTO_TARDIO")
            if job.status == "QUEUED":
                try:
                    self._queue.remove((owner_sub, job.job_id))
                except ValueError:
                    job.status = "CANCEL_REQUESTED"
                else:
                    self._finish_cancelled_locked(job)
            elif job.status == "RUNNING" and job.current_repetition_id is None:
                try:
                    self._queue.remove((owner_sub, job.job_id))
                except ValueError:
                    job.status = "CANCEL_REQUESTED"
                    job.updated_at = self._now_for(job)
                else:
                    self._finish_cancelled_locked(job)
            elif job.status in {"RUNNING", "AGGREGATING"}:
                job.status = "CANCEL_REQUESTED"
                job.updated_at = self._now_for(job)
            self._condition.notify_all()
            return self._snapshot(job)

    def retry(self, owner_sub: str, job_id: UUID, key: UUID) -> JobSnapshot:
        with self._condition:
            self._expire_locked()
            original = self._owned_locked(owner_sub, job_id)
            if original.status not in {"FAILED", "CANCELLED"}:
                raise DiagnosticExecutorError("JOB_NAO_REPETIVEL")
            request = original.request.model_copy(update={"idempotency_key": key})
            return self._submit_locked(owner_sub, request, "RETRY", original.job_id)

    def close(self) -> None:
        with self._condition:
            if self._closed:
                return
            self._closed = True
            for job in self._jobs.values():
                if (
                    job.status == "QUEUED"
                    or job.status == "RUNNING"
                    and job.current_repetition_id is None
                ):
                    self._finish_cancelled_locked(job)
                elif job.status in {"RUNNING", "AGGREGATING"}:
                    job.status = "CANCEL_REQUESTED"
                    job.updated_at = self._now_for(job)
            self._queue.clear()
            self._condition.notify_all()
        self._pool.shutdown(wait=True, cancel_futures=True)
        self._dispatcher.join(timeout=5)

    def _dispatch_loop(self) -> None:
        while True:
            with self._condition:
                self._expire_locked()
                if self._closed:
                    return
                if not self._queue or self._running >= self._max_workers:
                    self._maintenance_waiter(
                        self._condition, self._next_expiry_timeout_locked()
                    )
                    continue
                job_key = self._queue.popleft()
                job = self._jobs.get(job_key)
                if job is None or job.status not in {"QUEUED", "RUNNING"}:
                    continue
                if job.current_repetition_id is not None:
                    continue
                index = job.completed
                repetition_id = (
                    job.request.sampling.repetitions[index].repetition_id
                    if isinstance(job.request.sampling, GeneratedInputPlan)
                    else job.request.selected_repetition_id
                )
                now = self._now_for(job)
                job.status = "RUNNING"
                job.started_at = job.started_at or now
                job.updated_at = now
                job.current_repetition_id = repetition_id
                self._running += 1
                task = RepetitionTask(job.request, index, self._build_sha)
            try:
                future = self._pool.submit(task)
            except Exception as error:  # noqa: BLE001 -- falha de infraestrutura do pool
                future = Future()
                future.set_exception(error)

            def completed_callback(
                completed: Future[object], current_job_key: JobKey = job_key
            ) -> None:
                self._completed(current_job_key, completed)

            future.add_done_callback(completed_callback)

    def _completed(self, job_key: JobKey, future: Future[object]) -> None:
        try:
            result = cast(RepetitionResult, future.result())
            failure: Exception | None = None
        except Exception as error:  # noqa: BLE001 -- fronteira do worker
            result = None
            failure = error
        aggregate: tuple[DiagnosticRequest, tuple[RepetitionResult, ...]] | None = None
        with self._condition:
            self._running -= 1
            job = self._jobs.get(job_key)
            if job is None:
                self._condition.notify_all()
                return
            job.current_repetition_id = None
            job.updated_at = self._now_for(job)
            if job.status == "CANCEL_REQUESTED":
                self._finish_cancelled_locked(job)
            elif failure is not None:
                job.failed += 1
                job.status = "FAILED"
                job.error = JobError(
                    code="DIAGNOSTICO_INVALIDO",
                    message="A repetição diagnóstica falhou.",
                    repetition_id=(
                        job.request.sampling.repetitions[job.completed].repetition_id
                        if isinstance(job.request.sampling, GeneratedInputPlan)
                        else job.request.selected_repetition_id
                    ),
                )
                self._finish_terminal_locked(job)
            elif result is not None:
                job.results.append(result)
                job.completed += 1
                if job.completed == job.total:
                    job.status = "AGGREGATING"
                    job.updated_at = self._now_for(job)
                    aggregate = (job.request, tuple(job.results))
                else:
                    job.status = "RUNNING"
                    self._queue.append(job_key)
            self._condition.notify_all()
        if aggregate is not None:
            request, results = aggregate
            try:
                envelope = aggregate_diagnostic(job_key[1], request, results)
                aggregation_error: Exception | None = None
            except Exception as caught:  # noqa: BLE001 -- validação do envelope é terminal
                envelope = None
                aggregation_error = caught
            with self._condition:
                job = self._jobs.get(job_key)
                if job is None:
                    return
                if job.status == "CANCEL_REQUESTED":
                    self._finish_cancelled_locked(job)
                elif aggregation_error is not None or envelope is None:
                    job.status = "FAILED"
                    job.error = JobError(
                        code="DIAGNOSTICO_INVALIDO",
                        message="O resultado diagnóstico não passou pelas validações.",
                        repetition_id=None,
                    )
                    self._finish_terminal_locked(job)
                else:
                    job.envelope = envelope
                    job.status = "SUCCEEDED"
                    self._finish_terminal_locked(job)
                self._condition.notify_all()

    def _finish_terminal_locked(self, job: _Job) -> None:
        now = self._now_for(job)
        job.updated_at = now
        job.finished_at = now
        job.current_repetition_id = None

    def _finish_cancelled_locked(self, job: _Job) -> None:
        job.status = "CANCELLED"
        job.error = None
        self._finish_terminal_locked(job)
