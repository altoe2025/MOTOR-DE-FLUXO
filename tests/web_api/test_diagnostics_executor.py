"""Concorrência e ciclo de vida do executor diagnóstico."""

from __future__ import annotations

import multiprocessing
from concurrent.futures import Future, ProcessPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Condition
from uuid import UUID

import pytest

from servidor.contracts.diagnostics import DiagnosticRequest
from servidor.generate_reference_fixture import build_reference_request

NOW = datetime(2026, 9, 20, 12, tzinfo=UTC)
OWNER_A = "00000000-0000-4000-8000-000000000101"
OWNER_B = "00000000-0000-4000-8000-000000000102"


def _request(index: int = 1, *, fingerprint: str = "a" * 64) -> DiagnosticRequest:
    preview = build_reference_request()
    selected = UUID(f"00000000-0000-4000-8000-{index:012d}")
    return DiagnosticRequest.model_validate(
        {
            "api_version": "1.0.0",
            "request_id": f"10000000-0000-4000-8000-{index:012d}",
            "idempotency_key": f"20000000-0000-4000-8000-{index:012d}",
            "study_id": preview["study_id"],
            "scenario_id": preview["scenario_id"],
            "scenario_revision": preview["scenario_revision"],
            "input_fingerprint": fingerprint,
            "sampling": {
                "kind": "FIXED_INPUT",
                "count": 1,
                "preview_request": preview,
            },
            "selected_repetition_id": str(selected),
            "provenance": preview["proveniencia"],
        }
    )


class ControlledPool:
    def __init__(self) -> None:
        self.submissions: list[tuple[object, Future[object]]] = []
        self.closed = False
        self._condition = Condition()

    def submit(self, task: object) -> Future[object]:
        future: Future[object] = Future()
        with self._condition:
            self.submissions.append((task, future))
            self._condition.notify_all()
        return future

    def wait_for_submissions(self, count: int) -> None:
        with self._condition:
            assert self._condition.wait_for(
                lambda: len(self.submissions) >= count, timeout=2
            )

    def shutdown(self, *, wait: bool, cancel_futures: bool) -> None:
        self.closed = wait and cancel_futures


@pytest.fixture
def executor_parts():
    from servidor.diagnostics.executor import DiagnosticExecutor

    pool = ControlledPool()
    now = [NOW]
    executor = DiagnosticExecutor(
        build_sha="a" * 40,
        worker_pool=pool,
        relogio=lambda: now[0],
        max_workers=1,
        max_jobs_per_owner=3,
        max_jobs_global=32,
        retention_seconds=86400,
    )
    try:
        yield executor, pool, now
    finally:
        executor.close()


def test_submit_publica_queued_e_dispatcha_fifo_sem_expor_outro_owner(executor_parts):
    """Pega despacho LIFO e lookup que ignore o owner autenticado."""
    from servidor.diagnostics.executor import DiagnosticExecutorError

    executor, pool, _ = executor_parts
    first = executor.submit(OWNER_A, _request(1))
    second = executor.submit(OWNER_B, _request(2))

    assert first.status == "QUEUED"
    assert first.progress.completed == 0
    pool.wait_for_submissions(1)
    assert pool.submissions[0][0].request.request_id == _request(1).request_id
    assert executor.get(OWNER_A, first.job_id).status == "RUNNING"
    assert executor.get(OWNER_B, second.job_id).status == "QUEUED"
    with pytest.raises(DiagnosticExecutorError, match="JOB_NAO_ENCONTRADO"):
        executor.get(OWNER_B, first.job_id)
    pool.submissions[0][1].set_exception(RuntimeError("libera primeiro slot"))
    pool.wait_for_submissions(2)
    assert pool.submissions[1][0].request.request_id == _request(2).request_id


def test_limites_por_owner_e_global_contam_jobs_ativos():
    """Pega admissão que conte só fila ou esqueça o limite global."""
    from servidor.diagnostics.executor import (
        DiagnosticExecutor,
        DiagnosticExecutorError,
    )

    owner_pool = ControlledPool()
    owner_executor = DiagnosticExecutor(
        build_sha="a" * 40,
        worker_pool=owner_pool,
        relogio=lambda: NOW,
        max_workers=1,
        max_jobs_per_owner=3,
        max_jobs_global=32,
    )
    try:
        for index in range(1, 4):
            owner_executor.submit(OWNER_A, _request(index))
        with pytest.raises(DiagnosticExecutorError, match="FILA_CHEIA"):
            owner_executor.submit(OWNER_A, _request(4))
    finally:
        owner_executor.close()

    global_pool = ControlledPool()
    global_executor = DiagnosticExecutor(
        build_sha="a" * 40,
        worker_pool=global_pool,
        relogio=lambda: NOW,
        max_workers=1,
        max_jobs_per_owner=40,
        max_jobs_global=32,
    )
    try:
        for index in range(1, 33):
            global_executor.submit(f"owner-{index}", _request(index))
        with pytest.raises(DiagnosticExecutorError, match="FILA_CHEIA"):
            global_executor.submit("owner-33", _request(33))
    finally:
        global_executor.close()


def test_cancelamento_queued_e_running_e_idempotente(executor_parts):
    """Pega cancelamento que agenda job removido ou nova repetição."""
    executor, pool, _ = executor_parts
    running = executor.submit(OWNER_A, _request(1))
    pool.wait_for_submissions(1)
    queued = executor.submit(OWNER_B, _request(2))

    cancelled = executor.cancel(OWNER_B, queued.job_id)
    assert cancelled.status == "CANCELLED"
    assert executor.cancel(OWNER_B, queued.job_id) == cancelled

    requested = executor.cancel(OWNER_A, running.job_id)
    assert requested.status == "CANCEL_REQUESTED"
    assert executor.cancel(OWNER_A, running.job_id).status == "CANCEL_REQUESTED"
    pool.submissions[0][1].set_exception(RuntimeError("resultado deve ser descartado"))
    terminal = executor.get(OWNER_A, running.job_id)
    assert terminal.status == "CANCELLED"
    assert len(pool.submissions) == 1


def test_idempotencia_conflito_retry_e_retencao(executor_parts):
    """Pega duplicação, retry de job ativo e expiração de job ativo."""
    from servidor.diagnostics.executor import DiagnosticExecutorError

    executor, pool, now = executor_parts
    request = _request(1)
    original = executor.submit(OWNER_A, request)
    assert executor.submit(OWNER_A, request).job_id == original.job_id

    conflicting = request.model_copy(update={"input_fingerprint": "b" * 64})
    with pytest.raises(DiagnosticExecutorError, match="IDEMPOTENCIA_CONFLITANTE"):
        executor.submit(OWNER_A, conflicting)
    with pytest.raises(DiagnosticExecutorError, match="JOB_NAO_REPETIVEL"):
        executor.retry(OWNER_A, original.job_id, UUID(int=99))

    now[0] += timedelta(days=2)
    assert executor.get(OWNER_A, original.job_id).status in {"QUEUED", "RUNNING"}
    pool.wait_for_submissions(1)
    pool.submissions[0][1].set_exception(RuntimeError("falha controlada"))
    failed = executor.get(OWNER_A, original.job_id)
    assert failed.status == "FAILED"
    with pytest.raises(DiagnosticExecutorError, match="IDEMPOTENCIA_CONFLITANTE"):
        executor.retry(OWNER_A, original.job_id, request.idempotency_key)
    retried = executor.retry(OWNER_A, original.job_id, UUID(int=99))
    assert retried.retry_of_job_id == original.job_id
    assert retried.job_id != original.job_id

    now[0] += timedelta(days=2)
    with pytest.raises(DiagnosticExecutorError, match="JOB_NAO_ENCONTRADO"):
        executor.get(OWNER_A, original.job_id)


def test_resultado_antes_do_sucesso_e_cancelamento_terminal_sao_rejeitados(
    executor_parts,
):
    """Pega publicação parcial e regressão de estado terminal."""
    from servidor.diagnostics.executor import DiagnosticExecutorError

    executor, pool, _ = executor_parts
    job = executor.submit(OWNER_A, _request(1))
    with pytest.raises(DiagnosticExecutorError, match="JOB_NAO_TERMINAL"):
        executor.result(OWNER_A, job.job_id)
    pool.wait_for_submissions(1)
    pool.submissions[0][1].set_exception(RuntimeError("falha controlada"))
    assert executor.get(OWNER_A, job.job_id).status == "FAILED"
    with pytest.raises(DiagnosticExecutorError, match="CANCELAMENTO_TARDIO"):
        executor.cancel(OWNER_A, job.job_id)


def test_close_fecha_pool_e_rejeita_novas_submissoes(executor_parts):
    """Pega shutdown que deixa fila aceitando trabalho e processo órfão."""
    from servidor.diagnostics.executor import DiagnosticExecutorError

    executor, pool, _ = executor_parts
    executor.close()
    assert pool.closed is True
    with pytest.raises(DiagnosticExecutorError, match="EXECUTOR_FECHADO"):
        executor.submit(OWNER_A, _request(1))


def test_worker_top_level_roda_com_spawn_e_publica_fingerprint_autoritativo():
    """Pega closure não picklable e uso do fingerprint fixo calculado por T6."""
    from servidor.diagnostics.service import (
        RepetitionTask,
        aggregate_diagnostic,
        execute_repetition,
    )

    request = _request(1, fingerprint="d" * 64)
    task = RepetitionTask(request=request, repetition_index=0, build_sha="a" * 40)
    with ProcessPoolExecutor(
        max_workers=1, mp_context=multiprocessing.get_context("spawn")
    ) as pool:
        result = pool.submit(execute_repetition, task).result(timeout=30)

    envelope = aggregate_diagnostic(UUID(int=700), request, (result,))
    assert result.envelope.statistics.repetition_id == request.selected_repetition_id
    assert envelope.repetitions[0].input_fingerprint == "d" * 64
    assert envelope.repetitions[0].participant_seeds == {}
    assert envelope.selected_execution == result.envelope

    from servidor.diagnostics.executor import DiagnosticExecutor

    controlled = ControlledPool()
    executor = DiagnosticExecutor(
        build_sha="a" * 40,
        worker_pool=controlled,
        relogio=lambda: NOW,
        max_workers=1,
    )
    try:
        snapshot = executor.submit(OWNER_A, request)
        controlled.wait_for_submissions(1)
        controlled.submissions[0][1].set_result(result)
        terminal = executor.get(OWNER_A, snapshot.job_id)
        assert terminal.status == "SUCCEEDED"
        assert terminal.progress.completed == 1
        assert executor.result(OWNER_A, snapshot.job_id).job_id == snapshot.job_id
    finally:
        executor.close()


def test_worker_generated_usa_exatamente_as_seeds_do_plano():
    """Pega regeneração com seed inventada ou metadado inferido do preview."""
    from servidor.contracts.preparation import EffectiveInput
    from servidor.diagnostics.service import RepetitionTask, execute_repetition
    from tests.web_api.test_preparation_http import _payload as preparation_payload

    effective = EffectiveInput.model_validate(preparation_payload()["input"])
    participant_id = str(effective.participants[0].id)
    repetitions = [
        {
            "repetition_id": f"30000000-0000-4000-8000-{index:012d}",
            "participant_seeds": {participant_id: str(index)},
        }
        for index in range(1, 11)
    ]
    generated = DiagnosticRequest.model_validate(
        {
            "api_version": "1.0.0",
            "request_id": "40000000-0000-4000-8000-000000000001",
            "idempotency_key": "40000000-0000-4000-8000-000000000002",
            "study_id": "40000000-0000-4000-8000-000000000003",
            "scenario_id": "40000000-0000-4000-8000-000000000004",
            "scenario_revision": 1,
            "input_fingerprint": "e" * 64,
            "sampling": {
                "kind": "GENERATED_INPUT",
                "count": 10,
                "preparation_input": effective.model_dump(mode="json"),
                "repetitions": repetitions,
            },
            "selected_repetition_id": repetitions[4]["repetition_id"],
            "provenance": {},
        }
    )

    result = execute_repetition(
        RepetitionTask(request=generated, repetition_index=4, build_sha="a" * 40)
    )

    assert result.participant_seeds == {participant_id: "5"}
    assert result.input_fingerprint == "e" * 64
    assert result.envelope.statistics.repetition_id == generated.selected_repetition_id
    assert result.request.cenario.ordens
