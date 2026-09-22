"""Endpoint autenticado e estateless do Replay temporal."""

from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import ValidationError

from servidor.auth import AuthenticatedUser, require_user
from servidor.contracts.replay import ReplayDocumentV1, ReplayRequestV1
from servidor.errors import ApiFailure, adopt_request_id, entrada_invalida
from servidor.replay import ReplayInconsistente, construir_replay

MAX_REPLAY_BYTES = 8 * 1024 * 1024
router = APIRouter(prefix="/api/v1/replays")
CurrentUser = Annotated[AuthenticatedUser, Depends(require_user)]


async def _read_body(request: Request) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > MAX_REPLAY_BYTES:
                raise ApiFailure(
                    413, "LIMITE_EXCEDIDO", "O corpo do Replay excede 8 MiB."
                )
        except ValueError as error:
            raise ApiFailure(400, "JSON_INVALIDO", "Content-Length inválido.") from error
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_REPLAY_BYTES:
            raise ApiFailure(413, "LIMITE_EXCEDIDO", "O corpo do Replay excede 8 MiB.")
    return bytes(body)


def _parse(request: Request, body: bytes) -> ReplayRequestV1:
    try:
        document = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ApiFailure(400, "JSON_INVALIDO", "O corpo não é JSON válido.") from error
    adopt_request_id(request, document)
    if isinstance(document, dict) and document.get("api_version") not in {
        None,
        "1.0.0",
    }:
        raise ApiFailure(
            409, "VERSAO_INCOMPATIVEL", "A versão do Replay não é suportada."
        )
    try:
        return ReplayRequestV1.model_validate(document)
    except ValidationError as error:
        raise entrada_invalida(error) from error


@router.post("", response_model=ReplayDocumentV1)
async def create_replay(request: Request, _: CurrentUser) -> Response:
    source = _parse(request, await _read_body(request))
    try:
        replay = construir_replay(source)
    except ReplayInconsistente as error:
        raise ApiFailure(
            409,
            "REPLAY_INCONSISTENTE",
            "O resultado persistido não pôde ser reconciliado para Replay.",
        ) from error
    payload = replay.model_dump_json()
    if len(payload.encode("utf-8")) > MAX_REPLAY_BYTES:
        raise ApiFailure(
            413, "RESULTADO_EXCEDE_LIMITE", "O Replay excede 8 MiB."
        )
    return Response(payload, media_type="application/json")

