"""Launcher local para experimentar a análise de carteiras."""

from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor

import uvicorn

from servidor.diagnostics.service import RepetitionTask, execute_repetition
from tests.web_api.run_e2e import build_e2e_app


class ImmediateDiagnosticPool:
    """Executa diagnósticos no motor real, sem liberação manual dos jobs."""

    def __init__(self) -> None:
        self.executor = ThreadPoolExecutor(max_workers=1)

    def submit(self, task: RepetitionTask) -> Future[object]:
        return self.executor.submit(execute_repetition, task)

    def shutdown(self, *, wait: bool, cancel_futures: bool) -> None:
        self.executor.shutdown(wait=wait, cancel_futures=cancel_futures)


def build_preview_app(pool: ImmediateDiagnosticPool | None = None):
    """Monta o app E2E com jobs imediatos e sem rotas de controle de teste."""
    worker_pool = pool or ImmediateDiagnosticPool()
    app = build_e2e_app(diagnostic_worker_pool=worker_pool)
    app.router.routes[:] = [
        route
        for route in app.router.routes
        if not getattr(route, "path", "").startswith("/__e2e__/")
    ]
    return app


def main() -> None:
    pool = ImmediateDiagnosticPool()
    try:
        app = build_preview_app(pool)
        uvicorn.run(app, host="127.0.0.1", port=8031, access_log=False)
    finally:
        pool.shutdown(wait=True, cancel_futures=True)


if __name__ == "__main__":
    main()
