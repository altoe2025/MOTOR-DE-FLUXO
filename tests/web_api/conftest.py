"""Entrada de referência derivada do YAML versionado."""

import pytest

from servidor.generate_reference_fixture import build_reference_request


@pytest.fixture
def reference_payload() -> dict[str, object]:
    return build_reference_request()
