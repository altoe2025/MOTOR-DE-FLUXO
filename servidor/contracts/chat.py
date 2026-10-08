"""Stateless chat HTTP contracts; conversation quotas remain local to IndexedDB."""

from __future__ import annotations

from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from servidor.contracts.chat_context import ChatContextV1, StudyChatContextV1
from servidor.contracts.primitives import StrictModel

ChatId = Annotated[str, Field(min_length=1, max_length=128, pattern=r"\S")]
Question = Annotated[str, Field(min_length=1, max_length=4000, pattern=r"\S")]
Answer = Annotated[str, Field(min_length=1, max_length=12000, pattern=r"\S")]
Fingerprint = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
ChatClassification = Literal["IN_SCOPE", "INSUFFICIENT_EVIDENCE", "OUT_OF_SCOPE", "MIXED"]


class UiControlState(StrictModel):
    helpId: ChatId
    enabledCount: Annotated[int, Field(ge=0, le=1000)]
    disabledCount: Annotated[int, Field(ge=0, le=1000)]

    @model_validator(mode="after")
    def nonempty(self) -> Self:
        if not 1 <= self.enabledCount + self.disabledCount <= 1000:
            raise ValueError("observação de controle vazia ou excessiva")
        return self


class RouteChatContext(StrictModel):
    routeId: ChatId
    helpId: ChatId | None
    studyId: ChatId | None
    scenarioId: ChatId | None
    diagnosticExecutionId: ChatId | None
    replayDay: Annotated[int, Field(ge=0)] | None
    uiControls: Annotated[list[UiControlState], Field(max_length=200)] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_controls(self) -> Self:
        if len({item.helpId for item in self.uiControls}) != len(self.uiControls):
            raise ValueError("observações de controle repetidas")
        return self


class ChatCitation(StrictModel):
    kind: Literal["EVIDENCE", "METRIC", "LIMITATION", "HELP"]
    id: ChatId


class ChatUserHistoryItem(StrictModel):
    role: Literal["USER"]
    text: Question
    contextFingerprint: Fingerprint | None


class ChatAssistantHistoryItem(StrictModel):
    role: Literal["ASSISTANT"]
    text: Answer
    contextFingerprint: Fingerprint | None


ChatHistoryItem = Annotated[
    ChatUserHistoryItem | ChatAssistantHistoryItem, Field(discriminator="role")
]


class ChatRequestV1(StrictModel):
    apiVersion: Literal["1.0.0"]
    conversationId: ChatId
    messageId: ChatId
    message: Question
    routeContext: RouteChatContext
    context: ChatContextV1 | None
    history: Annotated[list[ChatHistoryItem], Field(
        max_length=98,
        description="Mensagens anteriores; reserva pergunta e resposta na quota de 100.",
    )]

    @model_validator(mode="after")
    def validate_context(self) -> Self:
        context = self.context
        if isinstance(context, StudyChatContextV1):
            document = context.document
            route = self.routeContext
            selection = document.selection
            if (
                route.studyId != document.study.id
                or route.scenarioId != selection.scenarioId
                or route.diagnosticExecutionId != selection.diagnosticExecutionId
                or route.replayDay != selection.replayDay
            ):
                raise ValueError("documento de comunicação pertence a outro contexto")
        elif context is not None:
            route = self.routeContext
            if (
                route.routeId != "board"
                or route.studyId is not None
                or route.scenarioId is not None
                or route.diagnosticExecutionId is not None
                or route.replayDay is not None
            ):
                raise ValueError("contexto do Quadro pertence a outra rota")
        return self

class ChatResponseV1(StrictModel):
    apiVersion: Literal["1.0.0"]
    messageId: ChatId
    classification: ChatClassification
    answer: Answer
    citations: Annotated[list[ChatCitation], Field(max_length=100)]
    contextFingerprint: Fingerprint | None
    limitationCodes: Annotated[list[ChatId], Field(max_length=100)]
