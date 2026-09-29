"""Strict, read-only contexts accepted by the chat boundary."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import Field, field_validator, model_validator

from servidor.contracts.communication import UTC_PATTERN, CommunicationDocumentV1
from servidor.contracts.primitives import (
    DecimalText,
    Identificador,
    StrictModel,
    decimal_value,
)

BoardField = Literal[
    "studyId", "scenarioId", "executionId", "studyName", "scenarioName", "sourceLabel",
    "windowDays", "orderCount", "inBrl", "outBrl", "netability", "baselineTotalBrl",
    "nettedTotalBrl", "savingsBrl",
]
BOARD_FIELDS: tuple[str, ...] = (
    "studyId", "scenarioId", "executionId", "studyName", "scenarioName", "sourceLabel",
    "windowDays", "orderCount", "inBrl", "outBrl", "netability", "baselineTotalBrl",
    "nettedTotalBrl", "savingsBrl",
)


class BoardChatRowV1(StrictModel):
    rowKey: Identificador
    studyId: Identificador
    scenarioId: Identificador
    executionId: Identificador
    studyName: Annotated[str, Field(min_length=1, max_length=200)]
    scenarioName: Annotated[str, Field(min_length=1, max_length=200)]
    sourceLabel: Annotated[str, Field(min_length=1, max_length=200)]
    windowDays: Annotated[int, Field(ge=1)]
    orderCount: Annotated[int, Field(ge=0)]
    inBrl: DecimalText
    outBrl: DecimalText
    netability: DecimalText
    baselineTotalBrl: DecimalText
    nettedTotalBrl: DecimalText
    savingsBrl: DecimalText

    @field_validator(
        "inBrl", "outBrl", "baselineTotalBrl", "nettedTotalBrl",
    )
    @classmethod
    def validate_money(cls, value: str) -> str:
        if decimal_value(value) < 0:
            raise ValueError("valor monetário do Quadro não pode ser negativo")
        return value

    @field_validator("netability")
    @classmethod
    def validate_netability(cls, value: str) -> str:
        parsed = decimal_value(value)
        if parsed < Decimal(0) or parsed > Decimal(1):
            raise ValueError("netabilidade deve ficar entre zero e um")
        return value


class BoardEvidenceV1(StrictModel):
    rowKey: Identificador
    field: BoardField
    value: Annotated[str, Field(min_length=1, max_length=20_000)]


class BoardChatDocumentV1(StrictModel):
    apiVersion: Literal["1.0.0"]
    generatedAt: Annotated[str, Field(pattern=UTC_PATTERN)]
    rows: Annotated[list[BoardChatRowV1], Field(max_length=100)]
    evidenceIndex: Annotated[dict[Identificador, BoardEvidenceV1], Field(max_length=1_400)]
    contextFingerprint: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]

    @field_validator("generatedAt")
    @classmethod
    def validate_generated_at(cls, value: str) -> str:
        if re.fullmatch(UTC_PATTERN, value) is None:
            raise ValueError("generatedAt exige instante RFC3339 UTC terminado em Z")
        datetime.fromisoformat(value)
        return value

    @model_validator(mode="after")
    def validate_projection(self) -> Self:
        rows = {row.rowKey: row for row in self.rows}
        if len(rows) != len(self.rows):
            raise ValueError("rowKey duplicado no contexto do Quadro")
        expected: set[str] = set()
        for row in self.rows:
            dumped = row.model_dump(mode="json")
            for field in BOARD_FIELDS:
                evidence_id = f"BOARD:{row.rowKey}:{field}"
                expected.add(evidence_id)
                evidence = self.evidenceIndex.get(evidence_id)
                if evidence is None or evidence.rowKey != row.rowKey or evidence.field != field:
                    raise ValueError("evidência do Quadro ausente ou com identidade divergente")
                if evidence.value != str(dumped[field]):
                    raise ValueError("valor do Quadro diverge da evidência")
        if set(self.evidenceIndex) != expected:
            raise ValueError("índice de evidências do Quadro possui entradas inesperadas")
        payload = self.model_dump(mode="json", exclude={"generatedAt", "contextFingerprint"})
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        if hashlib.sha256(encoded.encode("utf-8")).hexdigest() != self.contextFingerprint:
            raise ValueError("contextFingerprint não corresponde ao Quadro")
        return self


class StudyChatContextV1(StrictModel):
    kind: Literal["STUDY"]
    document: CommunicationDocumentV1


class BoardChatContextV1(StrictModel):
    kind: Literal["BOARD"]
    document: BoardChatDocumentV1


ChatContextV1 = Annotated[
    StudyChatContextV1 | BoardChatContextV1,
    Field(discriminator="kind"),
]
