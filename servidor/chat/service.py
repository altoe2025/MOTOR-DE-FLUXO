"""Bounded adapter for an explicitly injected provider, without external I/O.

C3 publishes the port. No real provider is constructed here. C4 will implement
scope policies, evidence resolution and tools; until then only IN_SCOPE from an
injected implementation can produce an answer. Other decisions fail closed.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Annotated, Protocol

from pydantic import Field

from servidor.chat.scope import ScopeDecision, ScopeRequest
from servidor.contracts.chat import (
    Answer,
    ChatCitation,
    ChatId,
    ChatRequestV1,
    ChatResponseV1,
)
from servidor.contracts.primitives import StrictModel


@dataclass(frozen=True)
class AnswerRequest:
    chat: ChatRequestV1
    scope: ScopeDecision


class ProviderAnswer(StrictModel):
    answer: Answer
    citations: Annotated[list[ChatCitation], Field(max_length=100)]
    limitationCodes: Annotated[list[ChatId], Field(max_length=100)]


class ChatProvider(Protocol):
    async def classify(self, request: ScopeRequest) -> ScopeDecision: ...

    async def answer(self, request: AnswerRequest) -> ProviderAnswer: ...


class ChatUnavailable(Exception):
    """Optional capability unavailable; never expose the underlying exception."""


async def respond(
    source: ChatRequestV1, *, provider: ChatProvider | None, timeout_seconds: float,
) -> ChatResponseV1:
    if provider is None:
        raise ChatUnavailable
    async with asyncio.timeout(timeout_seconds):
        decision = await provider.classify(ScopeRequest(
            message=source.message, routeContext=source.routeContext,
        ))
        decision = ScopeDecision.model_validate(decision.model_dump())
        if decision.classification != "IN_SCOPE":
            raise ChatUnavailable
        supplied = await provider.answer(AnswerRequest(chat=source, scope=decision))
        answer = ProviderAnswer.model_validate(supplied.model_dump())
    return ChatResponseV1(
        apiVersion="1.0.0", messageId=source.messageId,
        classification=decision.classification,
        answer=answer.answer, citations=answer.citations,
        contextFingerprint=(
            source.communication.contextFingerprint if source.communication is not None else None
        ),
        limitationCodes=answer.limitationCodes,
    )
