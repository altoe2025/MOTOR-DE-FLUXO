"""Gera a resposta canônica de referência por meio do adaptador real."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from servidor.contracts.input import PreviaRequest
from servidor.generate_reference_fixture import build_reference_request
from servidor.motor_adapter import _executar_previa

REFERENCE_BUILD_SHA = "0" * 40
REFERENCE_EXECUTION_ID = UUID("00000000-0000-4000-8000-000000000010")
REFERENCE_TIME = datetime(2026, 9, 12, 20, 0, tzinfo=UTC)


def generate_reference_result(
    destination: str | Path = "contracts/fixtures/reference-result.json",
) -> Path:
    """Escreve uma fixture reproduzível, validada pelo portão de publicação."""
    request = PreviaRequest.model_validate(build_reference_request())
    envelope = _executar_previa(
        request,
        build_sha=REFERENCE_BUILD_SHA,
        relogio=lambda: REFERENCE_TIME,
        id_factory=lambda: REFERENCE_EXECUTION_ID,
    )
    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            envelope.model_dump(mode="json"),
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    return path


if __name__ == "__main__":
    generate_reference_result()
