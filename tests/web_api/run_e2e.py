"""Servidor local controlado para o percurso Playwright ponta a ponta."""

from __future__ import annotations

import json
import os
import subprocess
from collections import deque
from concurrent.futures import Future
from pathlib import Path
from threading import Condition
from typing import Any
from uuid import UUID

import uvicorn
from fastapi import BackgroundTasks

from servidor.app import create_app
from servidor.auth import AuthenticatedUser, SessionInvalid
from servidor.config import Settings
from servidor.diagnostics.executor import DiagnosticExecutor
from servidor.diagnostics.service import RepetitionTask, execute_repetition
from tests.web_api.measure_replay import measure_limit_replay

CONTROLLED_TOKEN = "mot21-controlled-e2e-token"
CONTROLLED_USER_ID = UUID("00000000-0000-4000-8000-000000000021")
CONTROLLED_TOKEN_B = "mot32-controlled-e2e-token-b"
CONTROLLED_USER_ID_B = UUID("00000000-0000-4000-8000-000000000022")
ROOT = Path(__file__).resolve().parents[2]


class ControlledDiagnosticPool:
    """Pool E2E liberado por evento, sem sleeps nem processos ocultos."""

    def __init__(self) -> None:
        self._condition = Condition()
        self._pending: deque[tuple[RepetitionTask, Future[object]]] = deque()
        self._active = 0
        self._max_active = 0
        self._submitted = 0
        self._closed = False

    def submit(self, task: RepetitionTask) -> Future[object]:
        future: Future[object] = Future()
        with self._condition:
            if self._closed:
                raise RuntimeError("pool E2E fechado")
            self._pending.append((task, future))
            self._active += 1
            self._submitted += 1
            self._max_active = max(self._max_active, self._active)
            self._condition.notify_all()

        def settled(_: Future[object]) -> None:
            with self._condition:
                self._active -= 1
                self._condition.notify_all()

        future.add_done_callback(settled)
        return future

    def wait_for_pending(self, count: int, timeout: float = 2) -> bool:
        with self._condition:
            return self._condition.wait_for(
                lambda: sum(not future.done() for _, future in self._pending) >= count,
                timeout=timeout,
            )

    def release_next(self, *, fail: bool = False) -> None:
        with self._condition:
            while self._pending:
                task, future = self._pending.popleft()
                if not future.done():
                    break
            else:
                raise RuntimeError("nenhuma repeticao pendente")
        if fail:
            future.set_exception(RuntimeError("falha controlada E2E"))
        else:
            future.set_result(execute_repetition(task))

    def release_all(self, *, fail: bool = False) -> None:
        while True:
            with self._condition:
                if not any(not future.done() for _, future in self._pending):
                    return
            self.release_next(fail=fail)

    def snapshot(self) -> dict[str, int | bool]:
        with self._condition:
            return {
                "active": self._active,
                "closed": self._closed,
                "max_active": self._max_active,
                "pending": sum(not future.done() for _, future in self._pending),
                "submitted": self._submitted,
            }

    def shutdown(self, *, wait: bool, cancel_futures: bool) -> None:
        del wait
        with self._condition:
            self._closed = True
            pending = list(self._pending)
            self._pending.clear()
        if cancel_futures:
            for _, future in pending:
                future.cancel()


class ControlledVerifier:
    """Aceita somente o token sintético do build E2E local."""

    def verify(self, token: str) -> AuthenticatedUser:
        users = {
            CONTROLLED_TOKEN: CONTROLLED_USER_ID,
            CONTROLLED_TOKEN_B: CONTROLLED_USER_ID_B,
        }
        try:
            return AuthenticatedUser(users[token])
        except KeyError as error:
            raise SessionInvalid("token controlado inválido") from error


def _head_sha() -> str:
    return subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def build_e2e_app(
    *,
    diagnostic_worker_pool: ControlledDiagnosticPool | None = None,
    diagnostic_max_workers: int = 1,
):
    settings = Settings(
        app_env="test",
        supabase_url="https://e2e.invalid",
        supabase_jwt_issuer="https://e2e.invalid/auth/v1",
        supabase_allowed_user_ids=frozenset({CONTROLLED_USER_ID, CONTROLLED_USER_ID_B}),
        motor_build_sha=os.environ.get("MOT_E2E_BUILD_SHA") or _head_sha(),
        web_dist_dir=ROOT / "web" / "dist",
        diagnostic_max_workers=diagnostic_max_workers,
    )
    pool = diagnostic_worker_pool or ControlledDiagnosticPool()
    executor = DiagnosticExecutor(
        build_sha=settings.motor_build_sha,
        worker_pool=pool,
        max_workers=settings.diagnostic_max_workers,
        max_jobs_per_owner=settings.diagnostic_max_jobs_per_user,
        max_jobs_global=settings.diagnostic_max_jobs_global,
        retention_seconds=settings.diagnostic_retention_seconds,
    )
    app = create_app(
        settings=settings,
        verifier=ControlledVerifier(),
        diagnostic_executor=executor,
    )
    app.state.e2e_diagnostic_pool = pool

    @app.post("/__e2e__/diagnostics/release", include_in_schema=False)
    def release_diagnostic(payload: dict[str, Any] | None = None) -> dict[str, object]:
        pool.release_next(fail=bool((payload or {}).get("fail", False)))
        return pool.snapshot()

    @app.get("/__e2e__/diagnostics/state", include_in_schema=False)
    def diagnostic_state() -> dict[str, object]:
        return pool.snapshot()

    @app.get("/__e2e__/replay/limit", include_in_schema=False)
    def replay_limit() -> dict[str, object]:
        report, document = measure_limit_replay()
        return {
            "report": report,
            "document": json.loads(document.model_dump_json()),
        }

    control_routes = app.router.routes[-3:]
    del app.router.routes[-3:]
    app.router.routes[0:0] = control_routes

    return app


def main() -> None:
    app = build_e2e_app()
    config = uvicorn.Config(
        app, host="127.0.0.1", port=int(os.environ.get("MOT_E2E_PORT", "8021")), access_log=False
    )
    server = uvicorn.Server(config)

    @app.post("/__e2e__/shutdown", include_in_schema=False)
    def shutdown(background_tasks: BackgroundTasks) -> dict[str, str]:
        background_tasks.add_task(setattr, server, "should_exit", True)
        return {"status": "stopping"}

    server.run()


if __name__ == "__main__":
    main()
