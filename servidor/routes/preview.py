"""Execução síncrona e limitada da prévia canônica."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from servidor.auth import AuthenticatedUser, require_user
from servidor.contracts.input import PreviaRequest
from servidor.errors import ApiFailure, adopt_request_id, entrada_invalida
from servidor.motor_adapter import executar_previa
from servidor.publication import ResultadoInvalido

MAX_REQUEST_BYTES = 1024 * 1024
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
router = APIRouter(prefix="/api/v1")
CurrentUser = Annotated[AuthenticatedUser, Depends(require_user)]


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


def _parse_request(request: Request, body: bytes) -> PreviaRequest:
    try:
        document = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ApiFailure(400, "JSON_INVALIDO", "O corpo não é JSON válido.") from error
    adopt_request_id(request, document)
    if isinstance(document, dict) and document.get("api_version") not in {None, "1.0.0"}:
        raise ApiFailure(
            409,
            "VERSAO_INCOMPATIVEL",
            "A versão da API não é suportada.",
        )
    try:
        return PreviaRequest.model_validate(document)
    except ValidationError as error:
        raise entrada_invalida(error) from error


@router.post("/previas")
async def preview(
    request: Request,
    _: CurrentUser,
) -> Response:
    body = await _read_limited_body(request)
    preview_request = _parse_request(request, body)
    slot = request.app.state.preview_slot
    if not slot.acquire(blocking=False):
        raise ApiFailure(
            429,
            "CAPACIDADE_OCUPADA",
            "Já existe uma prévia em execução.",
            headers={"Retry-After": "1"},
        )
    try:
        try:
            envelope = await run_in_threadpool(
                executar_previa,
                preview_request,
                build_sha=request.app.state.settings.motor_build_sha,
                relogio=lambda: datetime.now(UTC),
            )
        except ResultadoInvalido as error:
            raise ApiFailure(
                500,
                "RESULTADO_INVALIDO",
                "O resultado analítico não passou pelas validações.",
            ) from error
        payload = envelope.model_dump_json()
        if len(payload.encode("utf-8")) > MAX_RESPONSE_BYTES:
            raise ApiFailure(
                413,
                "RESULTADO_EXCEDE_LIMITE",
                "O resultado excede 8 MiB.",
            )
        return Response(payload, media_type="application/json")
    finally:
        slot.release()
