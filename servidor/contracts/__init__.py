"""Contratos públicos de transporte da API."""

from servidor.contracts.diagnostics import (
    DiagnosticEnvelope,
    DiagnosticRequest,
    DiagnosticRetryRequest,
    JobSnapshot,
)
from servidor.contracts.input import PreviaRequest
from servidor.contracts.output import ResultadoCanonicoDTO
from servidor.contracts.preparation import PreparationRequest, PreparationResponse
from servidor.contracts.preview import PreviewEnvelope
from servidor.contracts.replay import ReplayDocumentV1, ReplayRequestV1
from servidor.contracts.session import HealthResponse, SessionResponse

__all__ = (
    "DiagnosticEnvelope",
    "DiagnosticRequest",
    "DiagnosticRetryRequest",
    "HealthResponse",
    "JobSnapshot",
    "PreparationRequest",
    "PreparationResponse",
    "PreviaRequest",
    "PreviewEnvelope",
    "ReplayDocumentV1",
    "ReplayRequestV1",
    "ResultadoCanonicoDTO",
    "SessionResponse",
)
