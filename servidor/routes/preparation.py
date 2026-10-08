"""Endpoint autenticado para preparar ordens explícitas antes da prévia."""

from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from servidor.auth import AuthenticatedUser, require_user
from servidor.contracts.preparation import PreparationRequest, PreparationResponse
from servidor.errors import ApiFailure, adopt_request_id, entrada_invalida
from servidor.preparation import PreparationLimitExceeded, preparar_carteira

router = APIRouter(prefix="/api/v1")
CurrentUser = Annotated[AuthenticatedUser, Depends(require_user)]
MAX_REQUEST_BYTES = 1024 * 1024


async def _read_limited_body(request: Request) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > MAX_REQUEST_BYTES:
                raise ApiFailure(413, "LIMITE_EXCEDIDO", "O corpo excede 1 MiB.")
        except ValueError as error:
            raise ApiFailure(400, "JSON_INVALIDO", "Content-Length inválido.") from error
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_REQUEST_BYTES:
            raise ApiFailure(413, "LIMITE_EXCEDIDO", "O corpo excede 1 MiB.")
    return bytes(body)


def _parse_request(request: Request, body: bytes) -> PreparationRequest:
    try:
        document = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ApiFailure(400, "JSON_INVALIDO", "O corpo não é JSON válido.") from error
    adopt_request_id(request, document)
    if (
        isinstance(document, dict)
        and document.get("preparation_version") not in {None, "1.0.0"}
    ):
        raise ApiFailure(
            409,
            "VERSAO_INCOMPATIVEL",
            "A versão de preparação não é suportada.",
        )
    try:
        return PreparationRequest.model_validate(document)
    except ValidationError as error:
        raise entrada_invalida(error) from error


@router.post("/preparacoes", response_model=PreparationResponse)
async def preparation(
    request: Request,
    _: CurrentUser,
) -> PreparationResponse:
    """Materializa a carteira canônica, mas deliberadamente não executa o motor."""
    preparation_request = _parse_request(request, await _read_limited_body(request))
    build_sha = request.app.state.settings.motor_build_sha
    if preparation_request.expected_build_sha != build_sha:
        raise ApiFailure(
            409,
            "VERSAO_INCOMPATIVEL",
            "A versão esperada do motor não está disponível.",
        )
    try:
        return await run_in_threadpool(
            preparar_carteira,
            preparation_request,
            build_sha=build_sha,
        )
    except PreparationLimitExceeded as error:
        raise ApiFailure(
            422,
            "LIMITE_EXCEDIDO",
            "A carteira excede o limite seguro de preparação.",
        ) from error
