"""Typed classification port; no semantic classifier is implemented here."""

from servidor.contracts.chat import ChatClassification, Question, RouteChatContext
from servidor.contracts.primitives import StrictModel


class ScopeRequest(StrictModel):
    message: Question
    routeContext: RouteChatContext


class ScopeDecision(StrictModel):
    classification: ChatClassification
