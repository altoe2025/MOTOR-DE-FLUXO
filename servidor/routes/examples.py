"""Exemplo fixo empacotado, protegido pela sessão."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from servidor.auth import AuthenticatedUser, require_user
from servidor.contracts.preview import ReferenceExample

router = APIRouter(prefix="/api/v1")
CurrentUser = Annotated[AuthenticatedUser, Depends(require_user)]


@router.get("/examples/reference", response_model=ReferenceExample)
def reference_example(
    request: Request,
    _: CurrentUser,
) -> ReferenceExample:
    return request.app.state.reference_example
