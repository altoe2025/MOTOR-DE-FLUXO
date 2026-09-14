"""Fixtures versionadas de contratos HTTP."""

import json
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path

import pytest

from servidor.contracts.preparation import PreparationRequest
from servidor.generate_reference_fixture import build_reference_request

_AUTHORED_FIXTURE = Path("contracts/fixtures/authored-input.json")


@pytest.fixture
def reference_payload() -> dict[str, object]:
    return build_reference_request()


@pytest.fixture
def authored_payload() -> dict[str, object]:
    document = json.loads(_AUTHORED_FIXTURE.read_text(encoding="utf-8"))
    return deepcopy(document)


@pytest.fixture
def authored_request(authored_payload: dict[str, object]) -> PreparationRequest:
    return PreparationRequest.model_validate(authored_payload)


@pytest.fixture
def clock():
    return lambda: datetime(2026, 9, 13, tzinfo=UTC)
