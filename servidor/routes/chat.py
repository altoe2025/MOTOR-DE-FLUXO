"""Authenticated, bounded chat transport; no conversation state is kept server-side."""

from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from pydantic import ValidationError

from servidor.auth import AuthenticatedUser, require_user
from servidor.chat.service import respond
from servidor.contracts.chat import ChatRequestV1, ChatResponseV1
from servidor.errors import ApiFailure

MAX_CHAT_BYTES = 1024 * 1024
CHAT_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"description": "JSON ou Content-Length inválido (JSON_INVALIDO)."},
    401: {"description": "Bearer ausente ou inválido (SESSAO_INVALIDA)."},
    403: {"description": "Usuário sem acesso (ACESSO_NAO_PERMITIDO)."},
    413: {"description": "Corpo excede 1 MiB (LIMITE_EXCEDIDO)."},
    422: {"description": "Contrato ou documento inválido (ENTRADA_INVALIDA)."},
    503: {"description": "Chat desabilitado ou indisponível (CHAT_INDISPONIVEL)."},
}
router = APIRouter(prefix="/api/v1/chat")
CurrentUser = Annotated[AuthenticatedUser, Depends(require_user)]


async def _read_body(request: Request) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        if not content_length.isascii() or not content_length.isdigit():
            raise ApiFailure(400, "JSON_INVALIDO", "Content-Length inválido.")
        # Compare decimal text before int conversion, including extremely large headers.
        normalized = content_length.lstrip("0") or "0"
        if len(normalized) > 7 or int(normalized) > MAX_CHAT_BYTES:
            raise ApiFailure(413, "LIMITE_EXCEDIDO", "O corpo do chat excede 1 MiB.")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_CHAT_BYTES:
            raise ApiFailure(413, "LIMITE_EXCEDIDO", "O corpo do chat excede 1 MiB.")
        body.extend(chunk)
    return bytes(body)


@router.post("", response_model=ChatResponseV1, responses=CHAT_RESPONSES)
async def create_chat(request: Request, _: CurrentUser) -> ChatResponseV1:
    body = await _read_body(request)
    try:
        document = json.loads(body)
    except (ValueError, UnicodeDecodeError, RecursionError) as error:
        raise ApiFailure(400, "JSON_INVALIDO", "O corpo não é JSON válido.") from error
    try:
        source = ChatRequestV1.model_validate(document)
    except ValidationError as error:
        # Even unknown field names can contain private data; publish no input-derived paths.
        raise ApiFailure(422, "ENTRADA_INVALIDA", "A entrada contém campos inválidos.") from error
    configured = request.app.state.settings
    provider = request.app.state.chat_provider if configured.chat_enabled else None
    try:
        return await respond(source, provider=provider,
                             catalog=request.app.state.product_help_catalog,
                             timeout_seconds=configured.openai_chat_timeout_seconds)
    except Exception as error:
        raise ApiFailure(503, "CHAT_INDISPONIVEL", "O chat está indisponível.") from error
