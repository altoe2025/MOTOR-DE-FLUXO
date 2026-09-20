"""Rotas autenticadas do executor diagnóstico."""

from __future__ import annotations

import json
from typing import Annotated, TypeVar
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ValidationError

from servidor.auth import AuthenticatedUser, require_user
from servidor.contracts.diagnostics import (
    DiagnosticEnvelope,
    DiagnosticRequest,
    DiagnosticRetryRequest,
    JobSnapshot,
)
from servidor.diagnostics.executor import DiagnosticExecutorError
from servidor.errors import ApiFailure, adopt_request_id, entrada_invalida

MAX_REQUEST_BYTES = 1024 * 1024
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
router = APIRouter(prefix="/api/v1/diagnosticos")
CurrentUser = Annotated[AuthenticatedUser, Depends(require_user)]
Model = TypeVar("Model", bound=BaseModel)


async def _read_limited_body(request: Request) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > MAX_REQUEST_BYTES:
                raise ApiFailure(413, "LIMITE_EXCEDIDO", "O corpo excede 1 MiB.")
        except ValueError as error:
            raise ApiFailure(
                400, "JSON_INVALIDO", "Content-Length inválido."
            ) from error
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_REQUEST_BYTES:
            raise ApiFailure(413, "LIMITE_EXCEDIDO", "O corpo excede 1 MiB.")
    return bytes(body)


def _parse(request: Request, body: bytes, model: type[Model]) -> Model:
    try:
        document = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ApiFailure(400, "JSON_INVALIDO", "O corpo não é JSON válido.") from error
    adopt_request_id(request, document)
    if isinstance(document, dict) and document.get("api_version") not in {
        None,
        "1.0.0",
    }:
        raise ApiFailure(409, "VERSAO_INCOMPATIVEL", "A versão da API não é suportada.")
    try:
        return model.model_validate(document)
    except ValidationError as error:
        raise entrada_invalida(error) from error


def _failure(error: DiagnosticExecutorError) -> ApiFailure:
    mapping = {
        "FILA_CHEIA": (429, "A fila de diagnósticos está cheia."),
        "JOB_NAO_ENCONTRADO": (404, "Diagnóstico não encontrado."),
        "JOB_NAO_TERMINAL": (409, "O diagnóstico ainda não possui resultado."),
        "JOB_NAO_REPETIVEL": (409, "O diagnóstico não pode ser repetido."),
        "CANCELAMENTO_TARDIO": (409, "O diagnóstico já terminou."),
        "IDEMPOTENCIA_CONFLITANTE": (409, "A chave de idempotência conflita."),
        "EXECUTOR_FECHADO": (503, "O executor diagnóstico está indisponível."),
    }
    status, message = mapping.get(
        error.code, (500, "Ocorreu um erro interno no executor diagnóstico.")
    )
    headers = {"Retry-After": "1"} if error.code == "FILA_CHEIA" else {}
    return ApiFailure(status, error.code, message, headers=headers)


def _response(model: BaseModel, *, status_code: int = 200) -> Response:
    payload = model.model_dump_json()
    if len(payload.encode("utf-8")) > MAX_RESPONSE_BYTES:
        raise ApiFailure(413, "RESULTADO_EXCEDE_LIMITE", "O resultado excede 8 MiB.")
    return Response(payload, status_code=status_code, media_type="application/json")


@router.post("", response_model=JobSnapshot, status_code=202)
async def submit(request: Request, user: CurrentUser) -> Response:
    document = _parse(request, await _read_limited_body(request), DiagnosticRequest)
    try:
        snapshot = request.app.state.diagnostic_executor.submit(
            str(user.user_id), document
        )
    except DiagnosticExecutorError as error:
        raise _failure(error) from error
    return _response(JobSnapshot.model_validate(snapshot), status_code=202)


@router.get("/{job_id}", response_model=JobSnapshot)
def get(request: Request, user: CurrentUser, job_id: UUID) -> Response:
    try:
        snapshot = request.app.state.diagnostic_executor.get(str(user.user_id), job_id)
    except DiagnosticExecutorError as error:
        raise _failure(error) from error
    return _response(JobSnapshot.model_validate(snapshot))


@router.get("/{job_id}/resultado", response_model=DiagnosticEnvelope)
def result(request: Request, user: CurrentUser, job_id: UUID) -> Response:
    try:
        envelope = request.app.state.diagnostic_executor.result(
            str(user.user_id), job_id
        )
    except DiagnosticExecutorError as error:
        raise _failure(error) from error
    return _response(DiagnosticEnvelope.model_validate(envelope))


@router.post("/{job_id}/cancelamentos", response_model=JobSnapshot, status_code=202)
def cancel(request: Request, user: CurrentUser, job_id: UUID) -> Response:
    try:
        snapshot = request.app.state.diagnostic_executor.cancel(
            str(user.user_id), job_id
        )
    except DiagnosticExecutorError as error:
        raise _failure(error) from error
    return _response(JobSnapshot.model_validate(snapshot), status_code=202)


@router.post("/{job_id}/retries", response_model=JobSnapshot, status_code=202)
async def retry(request: Request, user: CurrentUser, job_id: UUID) -> Response:
    document = _parse(
        request, await _read_limited_body(request), DiagnosticRetryRequest
    )
    try:
        snapshot = request.app.state.diagnostic_executor.retry(
            str(user.user_id), job_id, document.idempotency_key
        )
    except DiagnosticExecutorError as error:
        raise _failure(error) from error
    return _response(JobSnapshot.model_validate(snapshot), status_code=202)
