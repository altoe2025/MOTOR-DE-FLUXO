"""OpenAI Responses adapter with bounded local tools and no remote conversation state.

Protocol references (consulted 2026-09-23):
https://developers.openai.com/api/docs/guides/function-calling
https://developers.openai.com/api/docs/guides/migrate-to-responses
"""

from __future__ import annotations

import json
from typing import Any, Literal

import httpx
from pydantic import Field

from servidor.chat.prompts import ANSWER_INSTRUCTIONS, SCOPE_INSTRUCTIONS
from servidor.chat.scope import ScopeDecision, ScopeRequest
from servidor.chat.service import AnswerRequest, ChatUnavailable, ProviderAnswer
from servidor.chat.structured_output import read_object, text_format
from servidor.chat.tools import ReadOnlyTools
from servidor.config import Settings

_URL = "https://api.openai.com/v1/responses"
_MAX_RESPONSE_BYTES = 1024 * 1024
_MAX_CALLS = 4
_MAX_ROUNDS = 2


class StructuredAnswer(ProviderAnswer):
    # Required in the provider schema; the injected C3 port retains its default.
    classification: Literal["IN_SCOPE", "INSUFFICIENT_EVIDENCE"] = Field(...)


def _output(response: dict[str, Any]) -> list[dict[str, Any]]:
    items = response.get("output")
    if (response.get("status") != "completed" or response.get("error") is not None
            or not isinstance(items, list) or not items or len(items) > 32):
        raise ValueError("invalid response")
    for item in items:
        if not isinstance(item, dict):
            raise TypeError("invalid output item")
        kind = item.get("type")
        if kind == "reasoning":
            if not isinstance(item.get("summary"), list):
                raise ValueError("invalid reasoning item")
        elif kind == "function_call":
            if item.get("status") != "completed" or any(
                not isinstance(item.get(key), str) or not item[key] or len(item[key]) > limit
                for key, limit in (("name", 128), ("call_id", 128), ("arguments", 4096))
            ):
                raise ValueError("invalid function call")
        elif kind == "message":
            content = item.get("content")
            if (item.get("role") != "assistant" or item.get("status") != "completed"
                    or not isinstance(content, list) or len(content) != 1
                    or not isinstance(content[0], dict)
                    or content[0].get("type") != "output_text"
                    or not isinstance(content[0].get("text"), str)):
                # Includes refusals; their free text is never forwarded or logged.
                raise ValueError("invalid message or refusal")
        else:
            raise ValueError("unsupported output item")
    return items


def _structured_message(items: list[dict[str, Any]]) -> dict[str, Any]:
    messages = [item for item in items if item["type"] == "message"]
    if len(messages) != 1 or any(item["type"] == "function_call" for item in items):
        raise ValueError("structured message required")
    return read_object(messages[0]["content"][0]["text"])


class OpenAIChatProvider:
    def __init__(self, settings: Settings, *, transport: httpx.AsyncBaseTransport | None = None):
        if not settings.chat_enabled or settings.openai_api_key is None or not settings.openai_chat_model:
            raise ChatUnavailable
        self._model = settings.openai_chat_model
        self._max_tokens = settings.openai_chat_max_output_tokens
        self._client = httpx.AsyncClient(
            headers={"Authorization": "Bearer " + settings.openai_api_key.get_secret_value()},
            timeout=settings.openai_chat_timeout_seconds,
            follow_redirects=False, trust_env=False, transport=transport,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _post(
        self, *, instructions: str, inputs: list[dict[str, Any]],
        schema: dict[str, Any], tools: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        body = {
            "model": self._model, "store": False, "instructions": instructions,
            "input": inputs, "tools": tools, "text": {"format": schema},
            "include": ["reasoning.encrypted_content"], "max_output_tokens": self._max_tokens,
        }
        async with self._client.stream("POST", _URL, json=body) as response:
            response.raise_for_status()
            content = bytearray()
            async for chunk in response.aiter_bytes():
                if len(content) + len(chunk) > _MAX_RESPONSE_BYTES:
                    raise ValueError("response too large")
                content.extend(chunk)
        return _output(read_object(bytes(content)))

    async def classify(self, request: ScopeRequest) -> ScopeDecision:
        try:
            items = await self._post(
                instructions=SCOPE_INSTRUCTIONS,
                inputs=[{"type": "message", "role": "user", "content": request.model_dump_json()}],
                schema=text_format(ScopeDecision, "scope_decision"), tools=[],
            )
            return ScopeDecision.model_validate(_structured_message(items))
        except (ValueError, TypeError, KeyError, RecursionError, httpx.HTTPError):
            raise ChatUnavailable from None

    async def answer(self, request: AnswerRequest) -> ProviderAnswer:
        try:
            return await self._answer(request)
        except (ValueError, TypeError, KeyError, RecursionError, httpx.HTTPError):
            raise ChatUnavailable from None

    async def _answer(self, request: AnswerRequest) -> ProviderAnswer:
        if request.scope.classification not in {"IN_SCOPE", "MIXED"}:
            raise ChatUnavailable
        registry = ReadOnlyTools(request.chat, request.catalog)
        inputs: list[dict[str, Any]] = [{"type": "message", "role": "user", "content": json.dumps({
            "question": request.chat.message,
            "classification": request.scope.classification,
            "routeContext": request.chat.routeContext.model_dump(mode="json"),
            "history": [item.model_dump(mode="json") for item in request.chat.history],
            "sources": registry.inventory(),
        }, ensure_ascii=False)}]
        seen: set[str] = set()
        for round_index in range(_MAX_ROUNDS + 1):
            items = await self._post(
                instructions=ANSWER_INSTRUCTIONS, inputs=inputs,
                schema=text_format(StructuredAnswer, "chat_answer"), tools=registry.definitions(),
            )
            calls = [item for item in items if item["type"] == "function_call"]
            if not calls:
                answer = StructuredAnswer.model_validate(_structured_message(items))
                registry.validate_references(answer.citations, answer.limitationCodes, served_only=True)
                return answer
            ids = [call["call_id"] for call in calls]
            if (round_index == _MAX_ROUNDS or len(seen) + len(ids) > _MAX_CALLS
                    or len(set(ids)) != len(ids) or seen.intersection(ids)
                    or any(item["type"] == "message" for item in items)):
                raise ChatUnavailable
            seen.update(ids)
            # Carry every output item, including encrypted reasoning, in this request only.
            inputs.extend(items)
            for call in calls:
                result = registry.execute(call["name"], call["arguments"])
                inputs.append({"type": "function_call_output", "call_id": call["call_id"],
                               "output": json.dumps(result, ensure_ascii=False, allow_nan=False)})
        raise ChatUnavailable
