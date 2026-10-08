"""Strict JSON parsing shared by model output and tool arguments."""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def _invalid_constant(_: str) -> None:
    raise ValueError("non-finite JSON value")


def read_object(content: str | bytes) -> dict[str, Any]:
    result = json.loads(content, object_pairs_hook=_unique_object, parse_constant=_invalid_constant)
    if not isinstance(result, dict):
        raise ValueError("JSON object required")  # noqa: TRY004 -- invalid JSON argument contract
    return result


def text_format(model: type[BaseModel], name: str) -> dict[str, Any]:
    return {"type": "json_schema", "name": name, "strict": True,
            "schema": model.model_json_schema()}
