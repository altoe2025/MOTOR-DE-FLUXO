"""Server-side thematic policy and source validation, independent of the provider."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Annotated, Literal, Protocol

from pydantic import Field

from servidor.catalogs.product_help import ProductHelpCatalogV1
from servidor.chat.prompts import INSUFFICIENT_TEXT, OUT_OF_SCOPE_TEXT
from servidor.chat.scope import ScopeDecision, ScopeRequest
from servidor.chat.tools import ReadOnlyTools
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
    catalog: ProductHelpCatalogV1


class ProviderAnswer(StrictModel):
    classification: Literal["IN_SCOPE", "INSUFFICIENT_EVIDENCE"] = "IN_SCOPE"
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
    catalog: ProductHelpCatalogV1,
) -> ChatResponseV1:
    if provider is None:
        raise ChatUnavailable
    async with asyncio.timeout(timeout_seconds):
        decision = await provider.classify(ScopeRequest(
            message=source.message, routeContext=source.routeContext,
        ))
        decision = ScopeDecision.model_validate(decision.model_dump(warnings=False))
        classification = decision.classification
        if classification == "OUT_OF_SCOPE":
            answer = ProviderAnswer(answer=OUT_OF_SCOPE_TEXT, citations=[], limitationCodes=[])
        elif classification == "INSUFFICIENT_EVIDENCE":
            answer = ProviderAnswer(answer=INSUFFICIENT_TEXT, citations=[],
                                    limitationCodes=["INSUFFICIENT_EVIDENCE"])
        else:
            supplied = await provider.answer(AnswerRequest(chat=source, scope=decision,
                                                           catalog=catalog))
            answer = ProviderAnswer.model_validate(supplied.model_dump(warnings=False))
            ReadOnlyTools(source, catalog).validate_references(answer.citations, answer.limitationCodes)
            if (answer.classification == "INSUFFICIENT_EVIDENCE" or not answer.citations
                    or "INSUFFICIENT_EVIDENCE" in answer.limitationCodes):
                classification = "INSUFFICIENT_EVIDENCE"
                answer = ProviderAnswer(answer=INSUFFICIENT_TEXT, citations=[],
                                        limitationCodes=["INSUFFICIENT_EVIDENCE"])
            if decision.classification == "MIXED":
                answer = ProviderAnswer.model_validate({
                    **answer.model_dump(), "answer": answer.answer + "\n\n" + OUT_OF_SCOPE_TEXT,
                })
    return ChatResponseV1(
        apiVersion="1.0.0", messageId=source.messageId,
        classification=classification,
        answer=answer.answer, citations=answer.citations,
        contextFingerprint=(
            source.communication.contextFingerprint if source.communication is not None else None
        ),
        limitationCodes=answer.limitationCodes,
    )
