"""Erros HTTP uniformes sem dados sensíveis da requisição."""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID, uuid4

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError


@dataclass
class ApiFailure(Exception):
    status_code: int
    code: str
    message: str
    fields: list[dict[str, str]] = field(default_factory=list)
    headers: dict[str, str] = field(default_factory=dict)


def request_id_for(request: Request) -> str:
    value = getattr(request.state, "request_id", None)
    return str(value if isinstance(value, UUID) else uuid4())


def adopt_request_id(request: Request, document: object) -> None:
    if not isinstance(document, dict):
        return
    try:
        request.state.request_id = UUID(str(document.get("request_id")))
    except ValueError:
        return


def validation_fields(error: ValidationError | RequestValidationError) -> list[dict[str, str]]:
    fields: list[dict[str, str]] = []
    safe_errors = (
        error.errors()
        if isinstance(error, RequestValidationError)
        else error.errors(include_input=False, include_context=False)
    )
    for item in safe_errors:
        location = [str(part) for part in item.get("loc", ()) if part != "body"]
        fields.append(
            {
                "path": "/" + "/".join(location),
                "code": str(item.get("type", "invalid")),
                "message": str(item.get("msg", "valor inválido")),
            }
        )
    return fields


def failure_response(request: Request, failure: ApiFailure) -> JSONResponse:
    headers = {"Cache-Control": "no-store", **failure.headers}
    return JSONResponse(
        status_code=failure.status_code,
        headers=headers,
        content={
            "error": {
                "code": failure.code,
                "message": failure.message,
                "request_id": request_id_for(request),
                "fields": failure.fields,
            }
        },
    )


def entrada_invalida(error: ValidationError | RequestValidationError) -> ApiFailure:
    return ApiFailure(
        422,
        "ENTRADA_INVALIDA",
        "A entrada contém campos inválidos.",
        validation_fields(error),
    )
