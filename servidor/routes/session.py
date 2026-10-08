"""Saúde e confirmação da sessão autenticada."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from servidor.auth import AuthenticatedUser, require_user
from servidor.contracts.session import HealthResponse, SessionResponse

router = APIRouter(prefix="/api/v1")
CurrentUser = Annotated[AuthenticatedUser, Depends(require_user)]


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/session", response_model=SessionResponse)
def session(user: CurrentUser) -> SessionResponse:
    return SessionResponse(user_id=user.user_id)
