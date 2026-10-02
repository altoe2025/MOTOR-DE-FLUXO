"""Regressions for bounded diagnostic lifecycle and complete provenance."""

from __future__ import annotations

import json
from concurrent.futures.process import BrokenProcessPool
from copy import deepcopy
from uuid import UUID

import pytest

from servidor.contracts.diagnostics import DiagnosticRequest
from servidor.contracts.input import (
    CenarioEntrada,
    PreviaRequest,
    _required_provenance_paths,
)
from servidor.diagnostics.executor import DiagnosticExecutor, DiagnosticExecutorError
from servidor.diagnostics.service import RepetitionTask, execute_repetition
from tests.web_api.test_diagnostics_executor import (
    OWNER_A,
    OWNER_B,
    ControlledPool,
    _generated_request,
    _request,
)
from tests.web_api.test_diagnostics_http import (
    FakeExecutor,
    Verifier,
    _auth,
    _payload,
    _settings,
)


@pytest.fixture
def client_parts():
    from fastapi.testclient import TestClient

    from servidor.app import create_app

    executor = FakeExecutor()
    with TestClient(
        create_app(_settings(), Verifier(), diagnostic_executor=executor)
    ) as client:
        yield client, executor


def large_payload(count, rules=0):
    payload = _payload()
    preview = payload["sampling"]["preview_request"]
    order = preview["cenario"]["ordens"][0]
    preview["cenario"]["ordens"] = [dict(order, id=f"order-{i}") for i in range(count)]
    preview["cenario"]["custo"]["iof_por_finalidade"] = [
        {"finalidade": f"PURPOSE-{i}", "direcao": "OUT", "aliquota": "0.01"}
        for i in range(rules)
    ]
    origin = dict(next(iter(preview["proveniencia"].values())), fonte="😀" * 200)
    preview["proveniencia"] = {
        path: deepcopy(origin)
        for path in _required_provenance_paths(
            CenarioEntrada.model_validate(preview["cenario"])
        )
    }
    payload["provenance"] = deepcopy(preview["proveniencia"])
    return payload


@pytest.mark.parametrize("count,rules,paths", [(99, 0, 504), (1000, 100, 5209)])
def test_complete_provenance_is_valid(count, rules, paths):
    payload = large_payload(count, rules)
    preview = PreviaRequest.model_validate(payload["sampling"]["preview_request"])
    assert len(preview.proveniencia) == paths
    assert DiagnosticRequest.model_validate(payload).sampling.count == 1


def test_large_utf8_payload_crosses_http_with_complete_provenance(client_parts):
    client, executor = client_parts
    payload = large_payload(1000, 100)
    body = json.dumps(payload, ensure_ascii=False).encode()
    assert len(body) > 8 * 1024 * 1024
    response = client.post(
        "/api/v1/diagnosticos",
        content=body,
        headers={**_auth(), "Content-Type": "application/json"},
    )
    assert response.status_code == 202, response.text
    assert len(executor.calls[-1][2].provenance) == 5209


@pytest.mark.parametrize("terminal", ["SUCCEEDED", "FAILED", "CANCELLED"])
def test_terminal_releases_intermediate_results(terminal):
    pool = ControlledPool()
    executor = DiagnosticExecutor(build_sha="a" * 40, worker_pool=pool, max_workers=1)
    request = _request() if terminal == "SUCCEEDED" else _generated_request()
    try:
        job = executor.submit(OWNER_A, request)
        pool.wait_for_submissions(1)
        pool.submissions[0][1].set_result(
            execute_repetition(RepetitionTask(request, 0, "a" * 40))
        )
        if terminal != "SUCCEEDED":
            pool.wait_for_submissions(2)
            if terminal == "CANCELLED":
                executor.cancel(OWNER_A, job.job_id)
            pool.submissions[1][1].set_exception(ValueError("invalid"))
        assert executor.get(OWNER_A, job.job_id).status == terminal
        assert executor._jobs[(OWNER_A, job.job_id)].results == []
        if terminal == "SUCCEEDED":
            assert executor.result(OWNER_A, job.job_id).job_id == job.job_id
        else:
            retry = executor.retry(OWNER_A, job.job_id, UUID(int=991))
            assert (
                executor._jobs[(OWNER_A, retry.job_id)].request.sampling
                == request.sampling
            )
    finally:
        executor.close()


def test_worker_failure_logs_only_safe_category_type_and_ids(caplog):
    pool = ControlledPool()
    executor = DiagnosticExecutor(build_sha="a" * 40, worker_pool=pool)
    try:
        job = executor.submit(OWNER_A, _request())
        pool.wait_for_submissions(1)
        pool.submissions[0][1].set_exception(ValueError("SECRET-FINANCIAL-SENTINEL"))
        assert "worker" in caplog.text
        assert "ValueError" in caplog.text
        assert str(job.job_id) in caplog.text
        assert "SECRET-FINANCIAL-SENTINEL" not in caplog.text
    finally:
        executor.close()


def test_broken_pool_is_replaced_once_despite_late_callback(monkeypatch):
    import servidor.diagnostics.executor as module

    old = ControlledPool()
    healthy = ControlledPool()
    created = []

    def factory(workers):
        created.append(workers)
        return healthy

    monkeypatch.setattr(module, "_ProcessWorkerPool", factory)
    executor = DiagnosticExecutor(build_sha="a" * 40, worker_pool=old, max_workers=2)
    try:
        first = executor.submit(OWNER_A, _request(1))
        second = executor.submit(OWNER_B, _request(2))
        old.wait_for_submissions(2)
        old.submissions[0][1].set_exception(BrokenProcessPool("sensitive"))
        assert executor.get(OWNER_A, first.job_id).error.code == "EXECUTOR_INDISPONIVEL"
        executor.submit(OWNER_A, _request(3))
        healthy.wait_for_submissions(1)
        old.submissions[1][1].set_exception(BrokenProcessPool("late"))
        assert executor.get(OWNER_B, second.job_id).status == "FAILED"
        assert created == [2]
        healthy.submissions[0][1].set_result(
            execute_repetition(healthy.submissions[0][0])
        )
        assert executor.get(OWNER_A, _request(3).idempotency_key).status == "SUCCEEDED"
    finally:
        executor.close()


def test_count_pressure_evicts_oldest_terminal_only():
    pool = ControlledPool()
    executor = DiagnosticExecutor(
        build_sha="a" * 40, worker_pool=pool, max_workers=1, max_terminal_jobs=1
    )
    try:
        first = executor.submit(OWNER_A, _request(1))
        pool.wait_for_submissions(1)
        pool.submissions[0][1].set_exception(ValueError("first"))
        second = executor.submit(OWNER_A, _request(2))
        pool.wait_for_submissions(2)
        active = executor.submit(OWNER_B, _request(3))
        pool.submissions[1][1].set_exception(ValueError("second"))
        with pytest.raises(DiagnosticExecutorError, match="JOB_NAO_ENCONTRADO"):
            executor.get(OWNER_A, first.job_id)
        assert executor.get(OWNER_A, second.job_id).status == "FAILED"
        assert executor.get(OWNER_B, active.job_id).status in {"QUEUED", "RUNNING"}
        assert (OWNER_A, first.job_id) not in executor._idempotency
    finally:
        executor.close()


def test_real_child_death_allows_another_owner_and_retry():
    import multiprocessing

    from tests.web_api.test_diagnostics_executor import SpawnEventPool

    context = multiprocessing.get_context("spawn")
    with context.Manager() as manager:
        started, release = manager.Event(), manager.Event()
        pool = SpawnEventPool(started, release)
        executor = DiagnosticExecutor(
            build_sha="a" * 40, worker_pool=pool, max_workers=1
        )
        try:
            job = executor.submit(OWNER_A, _request(61))
            assert started.wait(30)
            pool.capture_workers()
            pool.workers[0].terminate()
            pool.workers[0].join(10)
            with executor._condition:
                assert executor._condition.wait_for(
                    lambda: executor._jobs[(OWNER_A, job.job_id)].status == "FAILED", 30
                )
            next_job = executor.submit(OWNER_B, _request(62))
            with executor._condition:
                assert executor._condition.wait_for(
                    lambda: (
                        executor._jobs[(OWNER_B, next_job.job_id)].status
                        in {"SUCCEEDED", "FAILED"}
                    ),
                    30,
                )
            assert executor.get(OWNER_B, next_job.job_id).status == "SUCCEEDED"
            retry = executor.retry(OWNER_A, job.job_id, UUID(int=996))
            with executor._condition:
                assert executor._condition.wait_for(
                    lambda: (
                        executor._jobs[(OWNER_A, retry.job_id)].status
                        in {"SUCCEEDED", "FAILED"}
                    ),
                    30,
                )
            assert executor.get(OWNER_A, retry.job_id).status == "SUCCEEDED"
        finally:
            release.set()
            executor.close()


def test_byte_pressure_counts_request_and_envelope():
    request = _request(1)
    pool = ControlledPool()
    executor = DiagnosticExecutor(
        build_sha="a" * 40,
        worker_pool=pool,
        max_workers=1,
        max_retained_bytes=len(request.model_dump_json().encode()) + 1,
    )
    try:
        first = executor.submit(OWNER_A, request)
        pool.wait_for_submissions(1)
        pool.submissions[0][1].set_exception(ValueError("first"))
        assert executor.get(OWNER_A, first.job_id).status == "FAILED"
        second = executor.submit(OWNER_A, _request(2))
        pool.wait_for_submissions(2)
        pool.submissions[1][1].set_exception(ValueError("second"))
        with pytest.raises(DiagnosticExecutorError, match="JOB_NAO_ENCONTRADO"):
            executor.get(OWNER_A, first.job_id)
        assert executor.get(OWNER_A, second.job_id).status == "FAILED"
    finally:
        executor.close()


def test_close_during_recovery_never_resurrects_pool(monkeypatch):
    from threading import Event, Thread

    import servidor.diagnostics.executor as module

    old, replacement = ControlledPool(), ControlledPool()
    entered, release = Event(), Event()

    def factory(workers):
        entered.set()
        assert release.wait(5)
        return replacement

    monkeypatch.setattr(module, "_ProcessWorkerPool", factory)
    executor = DiagnosticExecutor(build_sha="a" * 40, worker_pool=old)
    job = executor.submit(OWNER_A, _request())
    old.wait_for_submissions(1)
    callback = Thread(
        target=lambda: old.submissions[0][1].set_exception(BrokenProcessPool("dead"))
    )
    callback.start()
    try:
        assert entered.wait(5)
        executor.cancel(OWNER_A, job.job_id)
        executor.close()
    finally:
        release.set()
        callback.join(5)
    assert not callback.is_alive()
    assert executor._pool is old
    assert executor.get(OWNER_A, job.job_id).status == "CANCELLED"


def test_aggregation_failure_logs_sanitized_cause(monkeypatch, caplog):
    import servidor.diagnostics.executor as module

    def fail(*args):
        raise ValueError("SECRET-AGGREGATION")

    monkeypatch.setattr(module, "aggregate_diagnostic", fail)
    pool = ControlledPool()
    executor = DiagnosticExecutor(build_sha="a" * 40, worker_pool=pool)
    try:
        job = executor.submit(OWNER_A, _request())
        pool.wait_for_submissions(1)
        pool.submissions[0][1].set_result(execute_repetition(pool.submissions[0][0]))
        assert executor.get(OWNER_A, job.job_id).status == "FAILED"
        assert "aggregation" in caplog.text and "ValueError" in caplog.text
        assert "SECRET-AGGREGATION" not in caplog.text
    finally:
        executor.close()


def test_large_envelope_fits_http_and_default_retention(client_parts):
    from servidor.diagnostics.service import aggregate_diagnostic
    from servidor.routes.diagnostics import MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES

    client, fake = client_parts
    request = DiagnosticRequest.model_validate(large_payload(1000, 100))
    result = execute_repetition(RepetitionTask(request, 0, "a" * 40))
    envelope = aggregate_diagnostic(request.idempotency_key, request, (result,))
    request_bytes = len(request.model_dump_json().encode())
    envelope_bytes = len(envelope.model_dump_json().encode())
    assert request_bytes <= MAX_REQUEST_BYTES
    assert 8 * 1024 * 1024 < envelope_bytes <= MAX_RESPONSE_BYTES
    assert MAX_REQUEST_BYTES + MAX_RESPONSE_BYTES < 64 * 1024 * 1024
    fake.result_value = envelope
    response = client.get(
        f"/api/v1/diagnosticos/{request.idempotency_key}/resultado", headers=_auth()
    )
    assert response.status_code == 200
    print(f"maximal request_bytes={request_bytes} envelope_bytes={envelope_bytes}")
    pool = ControlledPool()
    executor = DiagnosticExecutor(build_sha="a" * 40, worker_pool=pool)
    try:
        job = executor.submit(OWNER_A, request)
        pool.wait_for_submissions(1)
        pool.submissions[0][1].set_result(result)
        assert executor.result(OWNER_A, job.job_id).axes == envelope.axes
        assert (
            executor._jobs[(OWNER_A, job.job_id)].retained_bytes
            == request_bytes + envelope_bytes
        )
    finally:
        executor.close()


def test_100_repetitions_retain_only_final_payload_and_identical_financials():
    from time import perf_counter

    from servidor.diagnostics.service import aggregate_diagnostic
    from tests.web_api.measure_diagnostics import build_generated_request

    request = build_generated_request(100)
    results = tuple(
        execute_repetition(RepetitionTask(request, index, "a" * 40))
        for index in range(100)
    )
    expected = aggregate_diagnostic(request.idempotency_key, request, results)
    pool = ControlledPool()
    executor = DiagnosticExecutor(build_sha="a" * 40, worker_pool=pool, max_workers=1)
    started = perf_counter()
    try:
        job = executor.submit(OWNER_A, request)
        for index, result in enumerate(results):
            pool.wait_for_submissions(index + 1)
            pool.submissions[index][1].set_result(result)
        actual = executor.result(OWNER_A, job.job_id)
        assert actual.axes == expected.axes
        assert actual.selected_execution == expected.selected_execution
        assert actual.repetitions == expected.repetitions
        assert executor._jobs[(OWNER_A, job.job_id)].results == []
        print(
            f"100reps elapsed_ms={(perf_counter() - started) * 1000:.1f} retained_bytes={executor._jobs[(OWNER_A, job.job_id)].retained_bytes} intermediates=0"
        )
    finally:
        executor.close()
