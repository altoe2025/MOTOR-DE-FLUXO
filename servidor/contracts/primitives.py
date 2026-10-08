"""Primitivas estritas compartilhadas pelos contratos HTTP."""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator

DECIMAL_PATTERN = r"^-?(0|[1-9][0-9]*)(\.[0-9]+)?$"
_DECIMAL_RE = re.compile(DECIMAL_PATTERN)

DecimalText = Annotated[
    str, Field(strict=True, min_length=1, max_length=80, pattern=DECIMAL_PATTERN)
]
Identificador = Annotated[str, Field(strict=True, min_length=1, max_length=128)]


def _parse_uuid(value: object) -> UUID:
    if isinstance(value, UUID):
        return value
    if not isinstance(value, str):
        raise ValueError("UUID deve ser texto")  # noqa: TRY004 - Pydantic validator contract
    return UUID(value)


def _parse_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        raise ValueError("instante deve ser texto ISO 8601")  # noqa: TRY004 - Pydantic validator contract
    return datetime.fromisoformat(value)


UUIDValue = Annotated[UUID, BeforeValidator(_parse_uuid)]
DateTimeValue = Annotated[datetime, BeforeValidator(_parse_datetime)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


def decimal_value(text: str) -> Decimal:
    if not isinstance(text, str) or not _DECIMAL_RE.fullmatch(text):
        raise ValueError("decimal deve ser texto ASCII finito sem expoente")
    return Decimal(text)


def decimal_places(text: str) -> int:
    return len(text.partition(".")[2])


def validate_identifier(value: str) -> str:
    if value != value.strip():
        raise ValueError("identificador não pode ter espaços externos")
    return value


class OrigemValor(StrictModel):
    tipo: Literal[
        "PADRAO_SINTETICO",
        "ESTIMATIVA_USUARIO",
        "DADO_OBSERVADO",
        "NAO_COLETADO",
    ]
    fonte: Annotated[str, Field(strict=True, min_length=1, max_length=200)]
    registrado_em_utc: DateTimeValue

    @field_validator("registrado_em_utc")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("registrado_em_utc deve conter fuso")
        return value
