"""Contratos mínimos de saúde e sessão."""

from typing import Literal

from servidor.contracts.primitives import StrictModel, UUIDValue


class HealthResponse(StrictModel):
    status: Literal["ok"]


class SessionResponse(StrictModel):
    user_id: UUIDValue
