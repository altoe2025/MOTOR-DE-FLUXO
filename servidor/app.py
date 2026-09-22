"""Factories da aplicação HTTP e do schema estável."""

from __future__ import annotations

import logging
import threading
import time
from contextlib import asynccontextmanager
from typing import Annotated, Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request, Security
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from servidor.auth import (
    AccessDenied,
    AuthUnavailable,
    JWKSTokenVerifier,
    SessionInvalid,
    TokenVerifier,
)
from servidor.config import Settings
from servidor.contracts.diagnostics import (
    DiagnosticEnvelope,
    DiagnosticRequest,
    DiagnosticRetryRequest,
    JobSnapshot,
)
from servidor.contracts.input import PreviaRequest
from servidor.contracts.preparation import PreparationRequest, PreparationResponse
from servidor.contracts.preview import PreviewEnvelope, ReferenceExample
from servidor.contracts.replay import ReplayDocumentV1, ReplayRequestV1
from servidor.contracts.primitives import UUIDValue
from servidor.contracts.session import HealthResponse, SessionResponse
from servidor.diagnostics.executor import DiagnosticExecutor
from servidor.errors import ApiFailure, entrada_invalida, failure_response
from servidor.generate_reference_fixture import build_reference_request
from servidor.preparation import preparar_carteira
from servidor.routes import diagnostics, examples, preparation, preview, replay, session
from servidor.static import install_static_routes

_LOGGER = logging.getLogger("servidor.http")
_SCHEMA_BEARER = HTTPBearer()
SchemaBearer = Annotated[
    HTTPAuthorizationCredentials,
    Security(_SCHEMA_BEARER),
]


def create_app(
    settings: Settings | None = None,
    verifier: TokenVerifier | None = None,
    diagnostic_executor: DiagnosticExecutor | None = None,
) -> FastAPI:
    configured = settings or Settings()  # type: ignore[call-arg]
    owns_verifier = verifier is None
    configured_verifier = verifier or JWKSTokenVerifier(configured)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        executor = diagnostic_executor or DiagnosticExecutor(
            build_sha=configured.motor_build_sha,
            max_workers=configured.diagnostic_max_workers,
            max_jobs_per_owner=configured.diagnostic_max_jobs_per_user,
            max_jobs_global=configured.diagnostic_max_jobs_global,
            retention_seconds=configured.diagnostic_retention_seconds,
        )
        app.state.diagnostic_executor = executor
        fixture = PreviaRequest.model_validate(build_reference_request())
        app.state.reference_example = ReferenceExample(
            cenario=fixture.cenario,
            periodo=fixture.periodo,
            proveniencia=fixture.proveniencia,
        )
        try:
            yield
        finally:
            executor.close()
            if owns_verifier and isinstance(configured_verifier, JWKSTokenVerifier):
                configured_verifier.close()

    app = FastAPI(
        title="Motor de Fluxo API",
        version="1.0.0",
        lifespan=lifespan,
    )
    app.state.settings = configured
    app.state.token_verifier = configured_verifier
    app.state.preview_slot = threading.BoundedSemaphore(1)

    @app.middleware("http")
    async def trace_request(request: Request, call_next):
        request.state.request_id = uuid4()
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:  # noqa: BLE001 -- fronteira HTTP deve sanitizar falhas inesperadas
            response = failure_response(
                request,
                ApiFailure(500, "ERRO_INTERNO", "Ocorreu um erro interno."),
            )
        response.headers["X-Request-ID"] = str(request.state.request_id)
        if request.url.path.startswith("/api/v1/") and request.url.path != "/api/v1/health":
            response.headers["Cache-Control"] = "no-store"
        _LOGGER.info(
            "method=%s path=%s status=%d duration_ms=%.1f request_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            (time.perf_counter() - started) * 1000,
            request.state.request_id,
        )
        return response

    @app.exception_handler(ApiFailure)
    async def api_failure_handler(request: Request, error: ApiFailure) -> JSONResponse:
        return failure_response(request, error)

    @app.exception_handler(SessionInvalid)
    async def invalid_session_handler(request: Request, _: SessionInvalid) -> JSONResponse:
        return failure_response(
            request,
            ApiFailure(
                401,
                "SESSAO_INVALIDA",
                "A sessão é inválida ou expirou.",
                headers={"WWW-Authenticate": "Bearer"},
            ),
        )

    @app.exception_handler(AccessDenied)
    async def access_denied_handler(request: Request, _: AccessDenied) -> JSONResponse:
        return failure_response(
            request,
            ApiFailure(403, "ACESSO_NAO_PERMITIDO", "Usuário sem acesso."),
        )

    @app.exception_handler(AuthUnavailable)
    async def auth_unavailable_handler(request: Request, _: AuthUnavailable) -> JSONResponse:
        return failure_response(
            request,
            ApiFailure(503, "AUTH_INDISPONIVEL", "Autenticação indisponível."),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(
        request: Request, error: RequestValidationError,
    ) -> JSONResponse:
        return failure_response(request, entrada_invalida(error))

    @app.exception_handler(Exception)
    async def internal_handler(request: Request, _: Exception) -> JSONResponse:
        return failure_response(
            request,
            ApiFailure(500, "ERRO_INTERNO", "Ocorreu um erro interno."),
        )

    app.include_router(session.router)
    app.include_router(examples.router)
    app.include_router(preparation.router)
    app.include_router(preview.router)
    app.include_router(diagnostics.router)
    app.include_router(replay.router)

    @app.api_route(
        "/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"]
    )
    async def unknown_api(path: str) -> None:
        raise ApiFailure(404, "RECURSO_NAO_ENCONTRADO", "Recurso não encontrado.")

    install_static_routes(app, configured.web_dist_dir)
    canonical_schema = create_schema_app().openapi()

    def canonical_openapi() -> dict[str, Any]:
        return canonical_schema

    app.openapi = canonical_openapi  # type: ignore[method-assign]

    return app


def create_schema_app() -> FastAPI:
    app = FastAPI(title="Motor de Fluxo API", version="1.0.0")

    @app.get("/api/v1/health", response_model=HealthResponse)
    def health_schema() -> HealthResponse:
        return HealthResponse(status="ok")

    @app.get("/api/v1/session", response_model=SessionResponse)
    def session_schema(_: SchemaBearer) -> SessionResponse:
        raise HTTPException(status_code=501, detail="endpoint disponível na T3")

    @app.get("/api/v1/examples/reference", response_model=ReferenceExample)
    def reference_example_schema(_: SchemaBearer) -> ReferenceExample:
        raise HTTPException(status_code=501, detail="endpoint disponível na T3")

    @app.post("/api/v1/previas", response_model=PreviewEnvelope)
    def preview_schema(_: SchemaBearer, request: PreviaRequest) -> PreviewEnvelope:
        raise HTTPException(status_code=501, detail="endpoint disponível na T3")

    @app.post("/api/v1/preparacoes", response_model=PreparationResponse)
    def preparation(
        _: SchemaBearer, request: PreparationRequest
    ) -> PreparationResponse:
        return preparar_carteira(request, build_sha=request.expected_build_sha)

    @app.post(
        "/api/v1/diagnosticos", response_model=JobSnapshot, status_code=202
    )
    def diagnostic_schema(
        _: SchemaBearer, request: DiagnosticRequest
    ) -> JobSnapshot:
        raise HTTPException(status_code=501, detail="endpoint disponível na T7")

    @app.get("/api/v1/diagnosticos/{job_id}", response_model=JobSnapshot)
    def diagnostic_job_schema(_: SchemaBearer, job_id: UUIDValue) -> JobSnapshot:
        raise HTTPException(status_code=501, detail="endpoint disponível na T7")

    @app.get(
        "/api/v1/diagnosticos/{job_id}/resultado",
        response_model=DiagnosticEnvelope,
    )
    def diagnostic_result_schema(
        _: SchemaBearer, job_id: UUIDValue
    ) -> DiagnosticEnvelope:
        raise HTTPException(status_code=501, detail="endpoint disponível na T7")

    @app.post(
        "/api/v1/diagnosticos/{job_id}/cancelamentos",
        response_model=JobSnapshot,
        status_code=202,
    )
    def diagnostic_cancellation_schema(
        _: SchemaBearer, job_id: UUIDValue
    ) -> JobSnapshot:
        raise HTTPException(status_code=501, detail="endpoint disponível na T7")

    @app.post(
        "/api/v1/diagnosticos/{job_id}/retries",
        response_model=JobSnapshot,
        status_code=202,
    )
    def diagnostic_retry_schema(
        _: SchemaBearer,
        job_id: UUIDValue,
        request: DiagnosticRetryRequest,
    ) -> JobSnapshot:
        raise HTTPException(status_code=501, detail="endpoint disponível na T7")

    @app.post("/api/v1/replays", response_model=ReplayDocumentV1)
    def replay_schema(_: SchemaBearer, request: ReplayRequestV1) -> ReplayDocumentV1:
        raise HTTPException(status_code=501, detail="endpoint disponível na Etapa 5")

    return app
