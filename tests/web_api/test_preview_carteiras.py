from __future__ import annotations

from concurrent.futures import Future

import pytest
from fastapi.testclient import TestClient

from scripts import preview_carteiras


def test_immediate_pool_submits_task_and_returns_worker_result(monkeypatch):
    task = object()
    result = object()
    submitted: list[object] = []

    def execute(task_argument):
        submitted.append(task_argument)
        return result

    monkeypatch.setattr(preview_carteiras, "execute_repetition", execute)
    pool = preview_carteiras.ImmediateDiagnosticPool()
    try:
        future = pool.submit(task)
        assert isinstance(future, Future)
        assert future.result(timeout=2) is result
        assert submitted == [task]
    finally:
        pool.shutdown(wait=True, cancel_futures=True)


def test_immediate_pool_future_propagates_worker_exception(monkeypatch):
    failure = ValueError("diagnóstico inválido")

    def execute(_task):
        raise failure

    monkeypatch.setattr(preview_carteiras, "execute_repetition", execute)
    pool = preview_carteiras.ImmediateDiagnosticPool()
    try:
        future = pool.submit(object())
        with pytest.raises(ValueError, match="diagnóstico inválido") as captured:
            future.result(timeout=2)
        assert captured.value is failure
    finally:
        pool.shutdown(wait=True, cancel_futures=True)


def test_immediate_pool_shutdown_releases_executor_and_rejects_new_work():
    pool = preview_carteiras.ImmediateDiagnosticPool()
    pool.shutdown(wait=True, cancel_futures=True)

    with pytest.raises(RuntimeError):
        pool.submit(object())


def test_preview_app_does_not_expose_e2e_control_endpoints():
    pool = preview_carteiras.ImmediateDiagnosticPool()
    app = preview_carteiras.build_preview_app(pool)
    try:
        with TestClient(app) as client:
            assert client.get("/__e2e__/diagnostics/state").status_code == 404
            assert client.post("/__e2e__/diagnostics/release").status_code == 405
            assert client.get("/__e2e__/replay/limit").status_code == 404
            response = client.post("/__e2e__/chat/control", json={"mode": "out"})
            assert response.status_code == 405
    finally:
        pool.shutdown(wait=True, cancel_futures=True)


def test_main_uses_loopback_preview_settings_and_closes_pool(monkeypatch):
    pool = preview_carteiras.ImmediateDiagnosticPool()
    calls: list[tuple[object, dict[str, object]]] = []

    monkeypatch.setattr(preview_carteiras, "ImmediateDiagnosticPool", lambda: pool)
    monkeypatch.setattr(preview_carteiras, "build_preview_app", lambda _pool: "app")
    monkeypatch.setattr(
        preview_carteiras.uvicorn,
        "run",
        lambda app, **kwargs: calls.append((app, kwargs)),
    )

    preview_carteiras.main()

    assert calls == [("app", {"host": "127.0.0.1", "port": 8031, "access_log": False})]
    with pytest.raises(RuntimeError):
        pool.submit(object())
