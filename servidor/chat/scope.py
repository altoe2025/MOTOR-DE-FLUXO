"""Thematic classification input; evidence sufficiency belongs to the answer phase."""

from typing import Annotated, Literal

from pydantic import Field

from servidor.contracts.chat import ChatHistoryItem, Question, RouteChatContext
from servidor.contracts.primitives import StrictModel


class ScopeRequest(StrictModel):
    message: Question
    routeContext: RouteChatContext
    history: Annotated[list[ChatHistoryItem], Field(max_length=98)]


class ScopeDecision(StrictModel):
    classification: Literal["IN_SCOPE", "OUT_OF_SCOPE", "MIXED"]
